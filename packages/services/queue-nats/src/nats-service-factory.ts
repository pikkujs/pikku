import {
  jetstream,
  jetstreamManager,
  RetentionPolicy,
  type ConsumerConfig,
  type JetStreamClient,
  type JetStreamManager,
} from '@nats-io/jetstream'
import { connect, type NatsConnection } from '@nats-io/transport-node'
import { NatsDelayedPublisher } from './nats-delayed-publisher.js'
import { NatsQueueService } from './nats-queue-service.js'
import { NatsSchedulerService } from './nats-scheduler-service.js'
import { NatsQueueWorkers } from './nats-queue-worker.js'

export interface NatsServiceFactoryOptions {
  /** NATS server(s), e.g. `nats://services.internal:4222`. */
  servers: string | string[]
  /** Stream holding this prefix's jobs. Created if absent. */
  streamName: string
  /**
   * Subject prefix for every queue in this stream. The stream is bound to
   * `<prefix>.>`, and each queue gets one consumer filtered to `<prefix>.<queue>`.
   */
  subjectPrefix: string
  /** Applied to every consumer; per-worker config from pikku overrides these. */
  defaultConsumerConfig?: Partial<ConsumerConfig>
  /** Replicas for the stream. 1 for a single node; 3 for a quorum cluster. */
  replicas?: number
  /**
   * JetStream publish dedupe window in ms, applied to the stream. This is what
   * backs `JobOptions.jobId`, and it is NOT equivalent to pg-boss's singleton
   * `jobId`: pg-boss rejects a duplicate for as long as the job row survives
   * (retention, days), whereas JetStream only remembers message ids for this
   * window. Set it deliberately — the server default is 2 minutes, which is
   * short enough that a retrying producer can double-enqueue.
   */
  duplicateWindowMs?: number
  /** Credentials/auth passthrough. */
  user?: string
  pass?: string
  token?: string
  name?: string
  /**
   * Called if the connection closes without `close()` having been asked for.
   *
   * With infinite reconnect below this only fires on a fault the client refuses
   * to retry — an authorization violation after a rotated password is the one
   * that matters in practice. The connection is then dead for the life of the
   * process and NOTHING reopens it, because `init()` runs once at boot. Rebuilding
   * it here would not help: the queue, worker and scheduler services each captured
   * the old JetStream client, so a new connection would be wired to nothing.
   *
   * So this is an escalation hook, not a repair one. A process holding a dead
   * queue is not healthy — it publishes nothing and runs no cron — and the only
   * honest responses are to exit and let the supervisor restart, or to fail a
   * readiness probe. The caller owns that choice; the default is to warn, so a
   * library consumer is never killed by surprise.
   */
  onConnectionLost?: (err?: Error) => void
}

/** Server version that first shipped repeating (cron / `@every`) message schedules. */
const MIN_SCHEDULER_VERSION = [2, 14, 0] as const

/**
 * Refuse to start against a server too old to schedule messages.
 *
 * Without this the failure is late, rare and cryptic: the stream config quietly
 * drops `allow_msg_schedules`, every publish keeps working, and the first thing
 * anyone notices is that a cron never fired — or a publish is rejected with
 * `10188 message schedules is disabled`, minutes to hours after boot, on a code
 * path nobody was watching. Since this package no longer carries a pg-boss
 * fallback, an old server means scheduling is simply absent, so it is worth
 * failing at connect time and naming the actual requirement.
 */
const assertSchedulerSupport = (version: string | undefined): void => {
  if (!version) return
  const parts = version.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.length < 3 || parts.some(Number.isNaN)) return
  const [major, minor, patch] = parts as [number, number, number]
  const [reqMajor, reqMinor, reqPatch] = MIN_SCHEDULER_VERSION
  const ok =
    major > reqMajor ||
    (major === reqMajor && (minor > reqMinor || (minor === reqMinor && patch >= reqPatch)))
  if (ok) return
  throw new Error(
    `NATS server ${version} is too old: message schedules (cron and delayed publish) need ` +
      `${MIN_SCHEDULER_VERSION.join('.')}+. Upgrading is one-way — the stream-state file format ` +
      `changed in 2.11 and again in 2.12, and there is no documented path back to 2.10 — so back ` +
      `up the JetStream store directory before upgrading the server.`,
  )
}

/**
 * Factory for the JetStream queue services.
 *
 * Mirrors PgBossServiceFactory, including `getSchedulerService`. That was not
 * always true: this package originally had no scheduler at all, because
 * JetStream had no delayed or scheduled message primitive and cron therefore
 * stayed on pg-boss. Server 2.12 added one-shot `@at` delays and 2.14 added
 * repeating cron schedules, so the split no longer buys anything and the
 * pg-boss dependency is gone.
 */
export class NatsServiceFactory {
  private connection?: NatsConnection
  private js?: JetStreamClient
  private jsm?: JetStreamManager
  private queueService?: NatsQueueService
  private queueWorkers?: NatsQueueWorkers
  private schedulerService?: NatsSchedulerService
  private initialized = false
  /** Set by `close()`, so the close watcher can tell a shutdown from a fault. */
  private closing = false

  constructor(private readonly options: NatsServiceFactoryOptions) {}

  async init(): Promise<void> {
    if (this.initialized) return

    this.connection = await connect({
      servers: this.options.servers,
      user: this.options.user,
      pass: this.options.pass,
      token: this.options.token,
      name: this.options.name,
      // RECONNECT FOREVER. The client default is 10 attempts, 2s apart, so about
      // twenty seconds of NATS being unreachable CLOSES the connection for good —
      // and `init()` runs once at boot, so nothing ever reopens it. The process
      // then looks healthy (HTTP fine, database fine, reads fine) while every
      // workflow dispatch throws `ClosedConnectionError` until someone restarts
      // the backend. That is the shape of the intermittent "project stuck in
      // creating" wedge: the row is written, the workflow that would build it is
      // never enqueued, and nothing surfaces because the failure is in a queue
      // publish rather than the request.
      //
      // A NATS restart routinely exceeds that budget, so the default turns
      // ordinary maintenance into a silent outage that outlives it. There is no
      // upside to giving up: a queue producer with nowhere to publish has no
      // useful degraded mode, and retrying forever costs one socket attempt every
      // few seconds.
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
      // Spread the herd. Every backend process reconnects off the same outage, and
      // without jitter they retry in lockstep and hit the server together at the
      // moment it is least able to take them.
      reconnectJitter: 1_000,
      // Boot must not race the queue either: without this, a backend starting
      // while NATS is still coming up fails `init()` outright rather than waiting
      // for it, which is the same outage one layer earlier.
      waitOnFirstConnect: true,
    })

    void this.watchForUnexpectedClose(this.connection)

    assertSchedulerSupport(this.connection.info?.version)

    const jsm = await jetstreamManager(this.connection)
    const js = jetstream(this.connection)
    this.js = js
    this.jsm = jsm

    // WorkQueue retention: a message is removed from the stream the instant it
    // is acked. That is what makes this a queue rather than a log, and it is
    // also why there is no history here — a completed job leaves no trace in
    // NATS, so success/failure rates must come from telemetry instead.
    //
    // WorkQueue also requires consumer filter subjects not to overlap, which is
    // satisfied by construction: one consumer per queue, filtered to exactly
    // that queue's subject.
    const streamConfig = {
      name: this.options.streamName,
      subjects: [`${this.options.subjectPrefix}.>`],
      retention: RetentionPolicy.Workqueue,
      num_replicas: this.options.replicas ?? 1,
      // Lets this stream hold schedule messages, which is how delayed publishes
      // and cron work — see NatsDelayedPublisher. Schedules must live in the
      // same stream as the subject they target, so this goes on the queue
      // stream itself rather than a stream beside it.
      //
      // Safe to turn on for an existing stream (it applies without recreating),
      // but note it is one-way: the server has no way to disable it again. It
      // also implicitly enables AllowRollup and clears DenyPurge, because
      // schedules are stored as rollup-subject messages.
      allow_msg_schedules: true,
      ...(this.options.duplicateWindowMs !== undefined
        ? { duplicate_window: this.options.duplicateWindowMs * 1_000_000 }
        : {}),
    }

    // `add` is STREAM.CREATE, which errors if the stream exists with a different
    // config — so the first deploy that changes duplicate_window or replicas
    // would fail at boot rather than converge. Try create, then update. Update
    // is the right call for a stream that exists: it applies the new config in
    // place without touching the messages already in it.
    try {
      await jsm.streams.add(streamConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Only "already exists" is recoverable this way; anything else (no
      // JetStream enabled, bad subject, insufficient replicas for the cluster
      // size) must surface, not be papered over by a second failing call.
      if (!/already in use|already exists/i.test(message)) throw err
      await jsm.streams.update(this.options.streamName, streamConfig)
    }

    // Wired at construction rather than via setDelayedPublisher: the pg-boss
    // publisher had to be attached late because it republished *through* this
    // service, so the two referenced each other. The native one only needs the
    // JetStream client, so the cycle is gone.
    this.queueService = new NatsQueueService(
      js,
      this.options.subjectPrefix,
      new NatsDelayedPublisher(js, this.options.subjectPrefix),
    )
    this.queueWorkers = new NatsQueueWorkers(
      js,
      jsm,
      this.options.streamName,
      this.options.subjectPrefix,
      this.options.defaultConsumerConfig,
    )
    this.schedulerService = new NatsSchedulerService(
      js,
      jsm,
      this.options.streamName,
      this.options.subjectPrefix,
    )
    this.initialized = true
  }

  /**
   * Surfaces a connection that closed without being asked to — see
   * `onConnectionLost`. Detached on purpose: `closed()` resolves only at the end
   * of the connection's life, so awaiting it would never let `init()` return.
   */
  private async watchForUnexpectedClose(connection: NatsConnection): Promise<void> {
    const err = await connection.closed()
    if (this.closing) return
    const reason = err instanceof Error ? err : undefined
    console.error(
      `NATS connection closed unexpectedly and will not reopen — this process can no longer publish jobs or run cron. ${reason?.message ?? ''}`,
    )
    this.options.onConnectionLost?.(reason)
  }

  getQueueService(): NatsQueueService {
    if (!this.queueService) {
      throw new Error('NatsServiceFactory.init() must be awaited before use')
    }
    return this.queueService
  }

  getSchedulerService(): NatsSchedulerService {
    if (!this.schedulerService) {
      throw new Error('NatsServiceFactory.init() must be awaited before use')
    }
    return this.schedulerService
  }

  getQueueWorkers(): NatsQueueWorkers {
    if (!this.queueWorkers) {
      throw new Error('NatsServiceFactory.init() must be awaited before use')
    }
    return this.queueWorkers
  }

  /**
   * Raw JetStream handles, for callers that run their own consumers instead of
   * going through pikku's queue registry — see `consumeQueue`.
   */
  getJetStream(): { js: JetStreamClient; jsm: JetStreamManager } {
    if (!this.js || !this.jsm) {
      throw new Error('NatsServiceFactory.init() must be awaited before use')
    }
    return { js: this.js, jsm: this.jsm }
  }

  getConnection(): NatsConnection {
    if (!this.connection) {
      throw new Error('NatsServiceFactory.init() must be awaited before use')
    }
    return this.connection
  }

  /** Drain the queue workers, if any are running. Returns the queues that still
   *  had jobs in flight. Safe before `init()`. */
  async drainWorkers(timeoutMs: number): Promise<string[]> {
    return (await this.queueWorkers?.drain(timeoutMs)) ?? []
  }

  async close(): Promise<void> {
    // Guarded on the connection rather than on `initialized`, because the two
    // diverge exactly when it matters: if `init()` fails after `connect()`
    // resolved — an old server rejected by `assertSchedulerSupport` is the
    // likely one — `initialized` is still false while a live connection is
    // already reconnecting forever, and an `initialized` guard would leak it
    // and keep the process alive.
    if (!this.connection) return
    this.closing = true
    await this.schedulerService?.stop()
    await this.queueWorkers?.stop()
    // `drain` rather than `close`: it flushes pending acks and lets in-flight
    // publishes land instead of dropping them, which is the difference between
    // a clean deploy and a batch of messages redelivered after ack_wait.
    await this.connection.drain()
    this.connection = undefined
    this.initialized = false
  }

  /** Alias for close() — used by stopSingletonServices. */
  async stop(): Promise<void> {
    await this.close()
  }
}
