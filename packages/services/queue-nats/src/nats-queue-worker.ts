import type { ConsumerConfig, JetStreamClient, JetStreamManager, JsMsg } from '@nats-io/jetstream'
import { AckPolicy, DeliverPolicy } from '@nats-io/jetstream'
import type {
  ConfigValidationResult,
  PikkuWorkerConfig,
  QueueConfigMapping,
  QueueWorkers,
} from '@pikku/core/queue'
import {
  QueueJobDiscardedError,
  QueueJobFailedError,
  registerQueueWorkers,
  runQueueJob,
} from '@pikku/core/queue'
import { pikkuState } from '@pikku/core/state'
import type { Logger } from '@pikku/core/services'
import { attemptsFor, backoffFor, mapJsMsgToQueueJob } from './utils.js'
import { consumeQueue, type ConsumeHandle } from './consume.js'

const MS_TO_NS = 1_000_000

/**
 * Default abandonment timeout, used when a worker declares no `lockDuration`.
 *
 * Matches pg-boss's `expire_seconds` default of 900s. This MUST be set
 * explicitly: JetStream's own default `ack_wait` is 30s, so leaving it unset
 * silently shortens the abandonment timeout 30x versus pg-boss, and any job
 * running longer than 30s — a workflow orchestrator that polls, say — is
 * redelivered while it is still running and executed a second time.
 */
const DEFAULT_ACK_WAIT_MS = 900_000

/**
 * Map a pikku worker config onto a JetStream consumer config.
 *
 * The important line is `max_ack_pending`. It is the number of messages the
 * server will let this consumer hold unacked at once — i.e. real per-message
 * concurrency, where a slow message occupies exactly one of the N slots. It is
 * NOT a batch size: nothing here ever hands several messages to one handler and
 * waits for all of them, which is the shape that produces head-of-line blocking
 * on a shared queue. Keep it that way.
 */
export const mapPikkuWorkerToNats = (workerConfig?: PikkuWorkerConfig): Partial<ConsumerConfig> => {
  const config: Partial<ConsumerConfig> = {
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_ack_pending: workerConfig?.batchSize ?? 10,
  }

  // Unlike pg-boss (where expiry is a fixed ceiling from job start), JetStream
  // redelivers purely on ack_wait — so this doubles as the abandonment timeout.
  // It must exceed the longest a handler can legitimately run, or a still-running
  // job gets redelivered and executed twice. Always set, never left to the
  // server default — see DEFAULT_ACK_WAIT_MS.
  config.ack_wait = (workerConfig?.lockDuration ?? DEFAULT_ACK_WAIT_MS) * MS_TO_NS

  return config
}

/**
 * JetStream queue worker implementation.
 *
 * Cron and delayed work are handled by `NatsSchedulerService`, which uses the
 * server's own message scheduler (2.14+) rather than a database.
 */
export class NatsQueueWorkers implements QueueWorkers {
  readonly name = 'nats'
  readonly supportsResults = false

  readonly configMappings: QueueConfigMapping = {
    supported: {
      batchSize: {
        queueProperty: 'max_ack_pending',
        description:
          'Number of messages this consumer may hold unacked at once — per-message concurrency',
      },
      lockDuration: {
        queueProperty: 'ack_wait',
        transform: (value: number) => value * MS_TO_NS,
        description:
          'How long the server waits for an ack before redelivering (converted from ms to ns)',
      },
    },

    unsupported: {
      name: {
        reason: 'Worker names are not supported in JetStream',
        explanation:
          'Consumers are identified by their durable name, which is derived from the queue name',
      },
      autorun: {
        reason: 'Autorun is not configurable',
        explanation: 'Consumers begin pulling as soon as they are registered',
      },
      drainDelay: {
        reason: 'Drain delay is not configurable in JetStream',
        explanation:
          'Shutdown is handled by stopping consumption and letting in-flight acks settle',
      },
      pollInterval: {
        reason: 'Pull consumers are not timer-driven',
        explanation:
          'The server pushes messages to a waiting pull request as they arrive, so there is no poll interval to tune',
      },
      groupConcurrency: {
        reason: 'JetStream has no per-group fairness primitive',
        explanation:
          'Fairness across groups would need either a stream per group or application-side accounting',
      },
    },

    fallbacks: {
      removeOnComplete: {
        reason: 'Work-queue streams delete messages on ack',
        explanation:
          'A completed message is removed from the stream immediately, so there is no retention to configure',
        fallbackValue: 'Always removed on ack',
      },
      removeOnFail: {
        reason: 'Exhausted messages leave via max_deliver, not retention',
        explanation:
          'A message that exceeds max_deliver raises a MAX_DELIVERIES advisory and is dropped from the stream',
        fallbackValue: 'Managed by max_deliver',
      },
    },
  }

  private readonly activeConsumers = new Map<string, ConsumeHandle>()

  constructor(
    private readonly js: JetStreamClient,
    private readonly jsm: JetStreamManager,
    private readonly streamName: string,
    private readonly subjectPrefix: string,
    private readonly defaultConsumerConfig: Partial<ConsumerConfig> = {},
  ) {}

  async registerQueues(logger?: Logger): Promise<Record<string, ConfigValidationResult[]>> {
    if (!logger) {
      logger = pikkuState(null, 'package', 'singletonServices')?.logger
    }
    if (!logger) {
      throw new Error(
        'Logger is required for registerQueues — pass it explicitly or ensure singleton services are initialized first',
      )
    }
    const log = logger

    return await registerQueueWorkers(this.configMappings, log, async (queueName, processor) => {
      const handle = await consumeQueue({
        js: this.js,
        jsm: this.jsm,
        streamName: this.streamName,
        subjectPrefix: this.subjectPrefix,
        queueName,
        config: {
          ...this.defaultConsumerConfig,
          ...mapPikkuWorkerToNats(processor.config),
        },
        handler: (msg) => this.handleMessage(queueName, msg, log),
        logger: log,
      })
      this.activeConsumers.set(queueName, handle)
    })
  }

  private async handleMessage(queueName: string, msg: JsMsg, logger: Logger): Promise<void> {
    try {
      await runQueueJob({ job: mapJsMsgToQueueJob(queueName, msg) })
      msg.ack()
    } catch (error: unknown) {
      if (error instanceof QueueJobDiscardedError) {
        // Permanently done, do not redeliver — the JetStream equivalent of
        // pg-boss completing a job in order to discard it.
        logger.info(`NATS message ${msg.seq} on ${queueName} discarded: ${error.message}`)
        msg.term()
        return
      }
      const message =
        error instanceof QueueJobFailedError || error instanceof Error
          ? error.message
          : 'Unknown error'

      // Enforce the job's own retry policy. This CANNOT be left to the consumer:
      // `attempts` is per-job (the workflow engine sets it per step, and uses 1
      // to mean "never retry"), while max_deliver is per-consumer — and an unset
      // max_deliver means unlimited, so without this a step marked no-retry
      // would be redelivered forever.
      const attempts = attemptsFor(msg)
      if (attempts !== undefined && msg.info.deliveryCount >= attempts) {
        logger.error(
          `NATS message ${msg.seq} on ${queueName} failed after ${msg.info.deliveryCount}/${attempts} attempts, giving up: ${message}`,
        )
        msg.term()
        return
      }

      const delayMs = backoffFor(msg)
      logger.error(
        `NATS message ${msg.seq} on ${queueName} failed (attempt ${msg.info.deliveryCount}${attempts ? `/${attempts}` : ''}), retrying in ${delayMs}ms: ${message}`,
      )
      // nak(delay) is what makes backoff real. A bare nak() redelivers as fast
      // as the server can, which turns an exponential-backoff policy into a hot
      // loop against whatever is already failing.
      msg.nak(delayMs)
    }
  }

  /** Stop consuming. In-flight handlers are left to settle their own acks. */
  async stop(): Promise<void> {
    for (const handle of this.activeConsumers.values()) {
      handle.stop()
    }
    this.activeConsumers.clear()
  }

  /**
   * Stop consuming and wait for in-flight jobs to settle, up to `timeoutMs`
   * across all queues. Returns the queues that did NOT finish in time.
   *
   * Use this on shutdown in preference to `stop()`. Without it a redeploy kills
   * handlers mid-job, and every unacked message waits out `ack_wait` before
   * being redelivered — safe, but slow, and it re-runs whatever side effects the
   * handler had already performed.
   */
  async drain(timeoutMs: number): Promise<string[]> {
    const deadline = Date.now() + timeoutMs
    const entries = [...this.activeConsumers.entries()]
    this.activeConsumers.clear()
    // Drained concurrently, not in sequence: one slow queue must not eat the
    // whole budget and leave the rest no time at all.
    const results = await Promise.all(
      entries.map(async ([queueName, handle]) => {
        const drained = await handle.drain(Math.max(0, deadline - Date.now()))
        return drained ? null : queueName
      }),
    )
    return results.filter((name): name is string => name !== null)
  }
}
