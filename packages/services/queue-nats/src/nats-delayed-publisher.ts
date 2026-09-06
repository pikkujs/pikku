import type { JetStreamClient } from '@nats-io/jetstream'
import { headers } from '@nats-io/nats-core'
import type { JobOptions } from '@pikku/core/queue'
import type { DelayedPublisher } from './nats-queue-service.js'
import {
  ATTEMPTS_HEADER,
  BACKOFF_DELAY_HEADER,
  BACKOFF_TYPE_HEADER,
  PIKKU_USER_ID_HEADER,
  SCHEDULE_HEADER,
  SCHEDULE_TARGET_HEADER,
  attemptsHeaderValue,
  scheduleSubjectFor,
  subjectForQueue,
} from './utils.js'

/**
 * Delayed delivery using JetStream's own message scheduler (server 2.12+).
 *
 * Replaces the pg-boss republisher this package used to need. A message is
 * published to a reserved schedule subject carrying `Nats-Schedule: @at <ts>`
 * and `Nats-Schedule-Target: <the real queue subject>`; the server holds it and
 * publishes the body verbatim onto the target when it comes due. Nothing polls,
 * and no second store owns time.
 *
 * Two constraints shape the subject layout, both enforced by the server at
 * publish time (error 10190, `message schedules target is invalid`):
 *
 *  - The target must be a subject captured by the SAME stream as the schedule.
 *    Cross-stream scheduling does not exist; it would need a sourcing topology.
 *  - The target must not be the schedule's own subject, which would make the
 *    schedule reproduce itself forever.
 *
 * So schedules live inside the queue stream, under a subject prefix that no
 * consumer filters on. That matters more than it looks: this is a WorkQueue
 * stream, where a message is deleted the instant a consumer acks it, and a
 * schedule that gets acked is a schedule that silently stops firing. No
 * consumer subscribes to `<prefix>._schedule.>`, so nothing can ack one.
 *
 * One-shot `@at` schedules are purged by the server once they fire, so this
 * leaves nothing behind to clean up.
 */
export class NatsDelayedPublisher implements DelayedPublisher {
  constructor(
    private readonly js: JetStreamClient,
    private readonly subjectPrefix: string
  ) {}

  async publishAfter<T>(
    queueName: string,
    data: T,
    delayMs: number,
    options?: JobOptions
  ): Promise<string> {
    const hdrs = headers()
    // RFC3339, which is what the server parses. A timestamp already in the past
    // fires immediately rather than erroring — the same shape as pg-boss's
    // `startAfter` with an elapsed date, so a delay that races the clock still
    // delivers instead of being dropped.
    hdrs.set(
      SCHEDULE_HEADER,
      `@at ${new Date(Date.now() + delayMs).toISOString()}`
    )
    hdrs.set(
      SCHEDULE_TARGET_HEADER,
      subjectForQueue(this.subjectPrefix, queueName)
    )

    // Every non-schedule header is copied onto the produced message verbatim,
    // so the job's retry policy survives the delay. `jobId` is deliberately not
    // one of them, in either direction:
    //
    //  - As `Nats-Msg-Id` it would be pointless — the server strips that header
    //    when producing, so it could never reach the stream's dedupe window.
    //  - As the schedule's subject it would be actively wrong. Republishing to
    //    a schedule subject REPLACES the schedule, so two delayed jobs sharing
    //    a jobId would silently cancel each other. The pg-boss publisher this
    //    replaces passed only `startAfter` and no singleton key, so delayed
    //    publishes have never deduped; making them dedupe now would be a
    //    behaviour change disguised as a port.
    //
    // Hence: no key, and every delayed publish gets its own subject.
    const { delay: _delay, jobId: _jobId, ...rest } = options ?? {}
    applyJobHeaders(hdrs, rest, queueName)

    const ack = await this.js.publish(
      scheduleSubjectFor(this.subjectPrefix, queueName),
      JSON.stringify(data),
      { headers: hdrs }
    )
    return String(ack.seq)
  }
}

/**
 * Copy the queue-level job options that must survive the delay onto the
 * schedule message. Kept here rather than shared with `NatsQueueService.add`
 * because the two disagree deliberately about `jobId` — see above.
 */
const applyJobHeaders = (
  hdrs: ReturnType<typeof headers>,
  options: Omit<JobOptions, 'delay' | 'jobId'>,
  queueName: string
): void => {
  if (options.pikkuUserId) {
    hdrs.set(PIKKU_USER_ID_HEADER, options.pikkuUserId)
  }
  if (options.attempts !== undefined) {
    hdrs.set(ATTEMPTS_HEADER, attemptsHeaderValue(options.attempts, queueName))
  }
  if (options.backoff !== undefined) {
    const backoff =
      typeof options.backoff === 'string'
        ? { type: options.backoff }
        : options.backoff
    hdrs.set(BACKOFF_TYPE_HEADER, backoff.type)
    if (backoff.delay !== undefined) {
      hdrs.set(BACKOFF_DELAY_HEADER, String(backoff.delay))
    }
  }
}
