import type { JetStreamClient } from '@nats-io/jetstream'
import { headers } from '@nats-io/nats-core'
import type { JobOptions, QueueJob, QueueService } from '@pikku/core/queue'
import {
  ATTEMPTS_HEADER,
  BACKOFF_DELAY_HEADER,
  BACKOFF_TYPE_HEADER,
  NATS_MSG_ID_HEADER,
  PIKKU_USER_ID_HEADER,
  attemptsHeaderValue,
  subjectForQueue,
} from './utils.js'

/**
 * Delayed delivery. Implemented by `NatsDelayedPublisher` against the server's
 * own message scheduler (2.12+); it used to be implemented against a store that
 * owned time, because JetStream had no such primitive.
 */
export interface DelayedPublisher {
  publishAfter<T>(
    queueName: string,
    data: T,
    delayMs: number,
    options?: JobOptions
  ): Promise<string>
}

/**
 * JetStream queue service for publishing jobs.
 *
 * Deliberately narrower than the pg-boss and bullmq services in two ways, both
 * forced by the broker rather than by choice — see `supportsResults` and
 * `getJob` below.
 */
export class NatsQueueService implements QueueService {
  /**
   * A work-queue stream deletes a message the moment it is acked, so there is
   * nowhere for a result to live and nothing to read it back from. Producers
   * that need a return value should use an RPC, not a queue.
   */
  readonly supportsResults = false

  private delayedPublisher?: DelayedPublisher

  constructor(
    private readonly js: JetStreamClient,
    private readonly subjectPrefix: string,
    delayedPublisher?: DelayedPublisher
  ) {
    this.delayedPublisher = delayedPublisher
  }

  /**
   * Attach the delayed publisher after construction. Needed because the pg-boss
   * publisher republishes *through* this service, so the two reference each
   * other and one of them has to be wired second.
   */
  setDelayedPublisher(publisher: DelayedPublisher): void {
    this.delayedPublisher = publisher
  }

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const hdrs = headers()
    if (options?.pikkuUserId) {
      hdrs.set(PIKKU_USER_ID_HEADER, options.pikkuUserId)
    }
    // JetStream dedupes on this header within the stream's duplicate window,
    // which is the closest equivalent to pg-boss's singleton `jobId`.
    if (options?.jobId) {
      hdrs.set(NATS_MSG_ID_HEADER, options.jobId)
    }
    // Retry policy travels with the job — see ATTEMPTS_HEADER. The worker
    // enforces it; JetStream itself has no per-message equivalent.
    if (options?.attempts !== undefined) {
      hdrs.set(
        ATTEMPTS_HEADER,
        attemptsHeaderValue(options.attempts, queueName)
      )
    }
    if (options?.backoff !== undefined) {
      const backoff =
        typeof options.backoff === 'string'
          ? { type: options.backoff }
          : options.backoff
      hdrs.set(BACKOFF_TYPE_HEADER, backoff.type)
      if (backoff.delay !== undefined) {
        hdrs.set(BACKOFF_DELAY_HEADER, String(backoff.delay))
      }
    }

    if (options?.delay) {
      // Silently dropping this is not an option: `delay` is what backs
      // workflow.sleep() and orchestrator backoff, so ignoring it turns a
      // one-hour sleep into a zero-second one and an exponential backoff into a
      // hot retry loop. `NatsServiceFactory` always wires a publisher, so this
      // only fires for a hand-built service.
      if (!this.delayedPublisher) {
        throw new Error(
          `Queue "${queueName}" was given delay=${options.delay}ms but no delayedPublisher is configured. Construct NatsQueueService with a NatsDelayedPublisher (NatsServiceFactory does this for you) or enqueue without a delay.`
        )
      }
      return await this.delayedPublisher.publishAfter(
        queueName,
        data,
        options.delay,
        options
      )
    }

    const ack = await this.js.publish(
      subjectForQueue(this.subjectPrefix, queueName),
      JSON.stringify(data),
      { headers: hdrs }
    )

    // The stream sequence is the only broker-assigned identity a message has.
    // It is unique per stream and monotonic, which is enough to correlate logs
    // and telemetry — but note it is NOT the `jobId` the caller may have passed.
    return String(ack.seq)
  }

  /**
   * Not supported. A message in a work-queue stream is only reachable through a
   * consumer, and only while it is being delivered — there is no lookup by id,
   * and an acked message no longer exists. Returning null (rather than throwing)
   * keeps callers that poll for optional status working; callers that genuinely
   * need per-job state should read it from telemetry.
   */
  async getJob<T, R>(
    _queueName: string,
    _jobId: string
  ): Promise<QueueJob<T, R> | null> {
    return null
  }
}
