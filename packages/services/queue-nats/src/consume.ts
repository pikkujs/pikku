import type {
  ConsumerConfig,
  ConsumerMessages,
  ConsumerNotification,
  JetStreamClient,
  JetStreamManager,
  JsMsg,
} from '@nats-io/jetstream'
import type { Logger } from '@pikku/core/services'
import { consumerNameForQueue, subjectForQueue } from './utils.js'

/** Backoff bounds for re-establishing a pull session that ended under us. */
const REATTACH_MIN_DELAY_MS = 250
const REATTACH_MAX_DELAY_MS = 30_000

/**
 * How many consecutive "can't reach it" notifications count as dead rather than
 * transient. Missed heartbeats and a not-found consumer both occur harmlessly
 * during a reconnect, so a single one must not tear down a healthy session.
 */
const REATTACH_NOTIFICATION_THRESHOLD = 3

/**
 * Decide whether a notification means this pull session is permanently dead,
 * returning the reason to log if so.
 *
 * This exists because of a trap documented in the client's own types: for a
 * durable pull consumer these conditions do NOT end the message iterator. On
 * `consumer_deleted` the docs say outright that "the client will continue to
 * attempt to pull messages" — only an *ordered* consumer recreates itself. So
 * the session sits there issuing pulls that can never be answered, the
 * `for await` never returns, and no error is ever thrown. Watching `status()`
 * is the only way to find out, which is why the supervisor below cannot rely on
 * the iterator ending on its own.
 */
const fatalNotificationReason = (
  notification: ConsumerNotification
): string | null => {
  switch (notification.type) {
    case 'consumer_deleted':
      return `consumer deleted server-side (${notification.code} ${notification.description})`
    case 'stream_not_found':
      return `stream ${notification.name} not found`
    case 'consumer_not_found':
      return notification.count >= REATTACH_NOTIFICATION_THRESHOLD
        ? `consumer not found on ${notification.count} consecutive pulls`
        : null
    case 'heartbeats_missed':
      return notification.count >= REATTACH_NOTIFICATION_THRESHOLD
        ? `${notification.count} consecutive heartbeats missed`
        : null
    default:
      return null
  }
}

export interface ConsumeOptions {
  js: JetStreamClient
  jsm: JetStreamManager
  streamName: string
  subjectPrefix: string
  queueName: string
  /** Merged over the defaults produced by `mapPikkuWorkerToNats`. */
  config?: Partial<ConsumerConfig>
  /**
   * Handles one message. It owns the message's terminal call — exactly one of
   * `ack`/`nak`/`term` — because only the caller knows whether a failure is
   * retryable. A handler that returns without acking leaves the message to be
   * redelivered after `ack_wait`.
   */
  handler: (msg: JsMsg) => Promise<void>
  /**
   * Used to report a pull session that ended and had to be re-established.
   * Optional only so existing callers and tests keep compiling — pass it in
   * production, because a silent re-attach loop is the failure this guards.
   */
  logger?: Pick<Logger, 'error' | 'info'>
}

export interface ConsumeHandle {
  /** Stop pulling. In-flight handlers are left to settle their own acks. */
  stop: () => void
  /** Handlers currently running — messages delivered but not yet settled. */
  readonly inFlight: number
  /**
   * Stop pulling, then wait for in-flight handlers to settle their acks.
   *
   * Resolves `true` if everything drained, `false` if the timeout expired
   * first. Timing out is safe rather than lossy — whatever is still unacked is
   * redelivered after `ack_wait`. Draining just avoids paying that redelivery
   * latency on every deploy, and avoids re-running side effects a handler had
   * already performed before it was killed.
   */
  drain: (timeoutMs: number) => Promise<boolean>
}

/**
 * Start a durable pull consumer and dispatch its messages to `handler`.
 *
 * The one thing that must never change here: `handler` is launched, not
 * awaited. Awaiting inside the `for await` would serialise processing no matter
 * what `max_ack_pending` says, so a single slow job would stall every message
 * behind it — the same head-of-line blocking as a pg-boss batch handler, just
 * moved client-side. In-flight work stays bounded anyway, because the server
 * will not deliver more than `max_ack_pending` unacked messages at once.
 *
 * This exists as a shared function precisely so that invariant is written down
 * once and every consumer inherits it, rather than being re-derived per caller.
 */
export const consumeQueue = async (
  options: ConsumeOptions
): Promise<ConsumeHandle> => {
  const {
    js,
    jsm,
    streamName,
    subjectPrefix,
    queueName,
    config,
    handler,
    logger,
  } = options
  const durable = consumerNameForQueue(subjectPrefix, queueName)

  // `add` is CONSUMER.CREATE: a no-op when the existing durable matches, but it
  // THROWS "consumer already exists" when any setting differs. So create first,
  // then fall back to update — otherwise the first deploy after changing a
  // queue's batchSize or lockDuration would fail at boot, on the second deploy
  // rather than the one that introduced the change. Same failure shape as
  // STREAM.CREATE vs STREAM.UPDATE in nats-service-factory.
  const consumerConfig = {
    durable_name: durable,
    filter_subject: subjectForQueue(subjectPrefix, queueName),
    ...config,
  }

  const attach = async (): Promise<ConsumerMessages> => {
    try {
      await jsm.consumers.add(streamName, consumerConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/already exists|already in use/i.test(message)) throw err
      await jsm.consumers.update(streamName, durable, consumerConfig)
    }
    const consumer = await js.consumers.get(streamName, durable)
    return await consumer.consume()
  }

  let stopped = false
  let inFlight = 0
  // Bumped on every re-attach so a watcher left over from a previous session
  // can never stop the session that replaced it.
  let generation = 0

  const describe = (err: unknown) =>
    err instanceof Error ? err.message : String(err)

  // Turns a silently-dead session into an ended one, which is the single shape
  // the supervisor below knows how to recover from.
  const watchStatus = (
    session: ConsumerMessages,
    sessionGeneration: number
  ) => {
    void (async () => {
      try {
        for await (const notification of session.status()) {
          if (stopped || generation !== sessionGeneration) return
          const reason = fatalNotificationReason(notification)
          if (reason === null) continue
          logger?.error(
            `NATS consumer ${durable} on ${streamName}: ${reason} — dropping the pull session so it can re-attach`
          )
          session.stop()
          return
        }
      } catch {
        // The status stream itself ending or failing is not the failure we are
        // guarding: the message iterator reports its own end, and the supervisor
        // acts on that. Swallowed so this never surfaces as an unhandled
        // rejection during shutdown.
      }
    })()
  }

  // The first attach is awaited and NOT retried: a failure here is a bad stream
  // or consumer config, and boot must fail loudly on it rather than spin.
  let messages = await attach()
  watchStatus(messages, generation)

  // Not awaited: this supervisor runs for the lifetime of the consumer.
  //
  // The inner `for await` is a pull SESSION, not the consumer itself, and the
  // session can die while the consumer lives on. Before this loop existed the
  // iterator simply ran off the end: the IIFE resolved, nothing pulled ever
  // again, and nothing said so. The durable consumer still existed server-side
  // with its backlog growing, every health check stayed green, and the only
  // symptom was work silently not happening. That is exactly how the
  // orchestrator queue reached 1681 undelivered messages while the backend
  // looked healthy — see knowledge/stability.md. So: re-attach, with backoff,
  // and say so at error level every time.
  //
  // Note this loop alone is not enough, which is why `watchStatus` exists: the
  // iterator ending is only one of the two ways a session dies, and it is the
  // less common one. The other is the session staying open forever while the
  // server has nothing to answer it with, and only `status()` reveals that.
  void (async () => {
    let backoffMs = REATTACH_MIN_DELAY_MS
    for (;;) {
      try {
        for await (const msg of messages) {
          if (stopped) break
          // Deliberately NOT awaited — see the note above. The counter is what
          // lets shutdown wait for these without serialising them; `finally` is
          // chained rather than `catch`ed so a rejecting handler still surfaces
          // as an unhandled rejection exactly as it did before.
          //
          // Started through a resolved promise so that a handler which throws
          // SYNCHRONOUSLY rejects like any other failure instead of unwinding
          // into the catch below, which would diagnose a handler bug as a dead
          // pull session and re-attach for no reason.
          const settled = Promise.resolve().then(() => handler(msg))
          inFlight++
          void settled.finally(() => {
            inFlight--
          })
        }
        if (stopped) return
        logger?.error(
          `NATS consumer ${durable} on ${streamName}: pull session ended unexpectedly — re-attaching`
        )
      } catch (err) {
        if (stopped) return
        logger?.error(
          `NATS consumer ${durable} on ${streamName}: pull session threw (${describe(err)}) — re-attaching`
        )
      }

      // Re-attach until it takes. `stop()` is checked on both sides of the wait
      // so a shutdown during backoff exits instead of reviving the consumer.
      for (;;) {
        if (stopped) return
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        if (stopped) return
        try {
          messages = await attach()
          // `stop()` only stops the session it can see, so one that arrives
          // after shutdown began has to stop itself. Without this the loop
          // below would enter `for await` on a live session whose only exit is
          // a message arriving — on an idle queue, never — leaving a pull
          // consumer on the connection after `drain()` reported it settled.
          if (stopped) {
            messages.stop()
            return
          }
          generation++
          watchStatus(messages, generation)
          logger?.info(`NATS consumer ${durable} on ${streamName}: re-attached`)
          backoffMs = REATTACH_MIN_DELAY_MS
          break
        } catch (err) {
          logger?.error(
            `NATS consumer ${durable} on ${streamName}: re-attach failed (${describe(err)}), retrying in ${backoffMs}ms`
          )
          backoffMs = Math.min(backoffMs * 2, REATTACH_MAX_DELAY_MS)
        }
      }
    }
  })()

  const stop = () => {
    stopped = true
    messages.stop()
  }

  return {
    stop,
    get inFlight() {
      return inFlight
    },
    drain: async (timeoutMs: number) => {
      stop()
      const deadline = Date.now() + timeoutMs
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      return inFlight === 0
    },
  }
}
