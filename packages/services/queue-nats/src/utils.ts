import type { JsMsg } from '@nats-io/jetstream'
import type { QueueJob, QueueJobStatus } from '@pikku/core/queue'

/** Header carrying the producer's pikku user id through to the worker. */
export const PIKKU_USER_ID_HEADER = 'Pikku-User-Id'

/** Header JetStream itself reads for publish-side dedupe within the stream's window. */
export const NATS_MSG_ID_HEADER = 'Nats-Msg-Id'

/**
 * Per-job retry policy, carried in headers.
 *
 * pg-boss and bullmq store `attempts`/`backoff` per job; JetStream only has
 * per-consumer `max_deliver` and a plain `nak`. Since the workflow engine sets
 * these per step — and treats `attempts: 1` as "never retry this" — a
 * per-consumer setting cannot express it. So the policy rides with the message
 * and the worker enforces it. Without this a step marked `retries: 0` would be
 * redelivered forever, because an unset `max_deliver` means unlimited.
 */
export const ATTEMPTS_HEADER = 'Pikku-Attempts'
export const BACKOFF_TYPE_HEADER = 'Pikku-Backoff-Type'
export const BACKOFF_DELAY_HEADER = 'Pikku-Backoff-Delay'

/**
 * Header value for a job's retry limit, rejecting anything the worker could not
 * enforce.
 *
 * `JobOptions.attempts` is typed as a plain number, and an unenforceable value
 * fails in the worst direction: `attemptsFor` reads a zero, a negative or a NaN
 * back as "no limit set", and the worker then naks forever. A fraction is worse
 * than useless — it survives as a number and silently means `ceil(attempts)`.
 * Both are caller mistakes, so they are refused at enqueue rather than turned
 * into an infinite redelivery loop nobody asked for.
 */
export const attemptsHeaderValue = (attempts: number, queueName: string): string => {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error(
      `Queue "${queueName}" was given attempts=${attempts}, which is not a positive integer. An unenforceable limit reads back as "no limit" and the job would be retried forever; pass attempts >= 1 or omit it.`,
    )
  }
  return String(attempts)
}

/** Default base delay when a job asks for backoff without naming one. */
export const DEFAULT_BACKOFF_DELAY_MS = 1_000

/**
 * Delay before redelivering a message on its `deliveryCount`-th failure.
 * Exponential mirrors bullmq/pg-boss: base * 2^(n-1), capped so a long-lived
 * retry cannot drift past any sane ack_wait/visibility reasoning.
 */
export const backoffDelayMs = (
  deliveryCount: number,
  type: string | undefined,
  baseMs: number = DEFAULT_BACKOFF_DELAY_MS,
): number => {
  if (!type) return 0
  if (type === 'fixed') return baseMs
  // 'exponential' and anything unrecognised — growing is the safe default,
  // since the failure mode of guessing wrong is retrying too slowly, not too fast.
  const capMs = 60 * 60_000
  return Math.min(baseMs * 2 ** Math.max(0, deliveryCount - 1), capMs)
}

/**
 * Pikku queue names are free-form strings; NATS subject tokens are not. `.` is
 * the subject separator and `*`/`>` are wildcards, so a queue name containing
 * any of them would silently widen a consumer's filter and start stealing other
 * queues' messages. Replace them rather than rejecting, and keep the mapping
 * total so the same queue name always resolves to the same subject.
 *
 * Not injective, and knowingly so: `a.b` and `a_b` collapse to the same token,
 * so two queues named that way would share one subject and one durable
 * consumer. An escaping scheme would fix it, at the cost of changing the
 * subject and durable name of every queue that already exists — which strands
 * the backlog on the old names. Not worth it for a collision that needs two
 * queue names differing only in a separator.
 */
export const queueNameToToken = (queueName: string): string => queueName.replace(/[.*>\s]/g, '_')

/** Subject a job for `queueName` is published to. */
export const subjectForQueue = (prefix: string, queueName: string): string =>
  `${prefix}.${queueNameToToken(queueName)}`

/**
 * Headers driving JetStream's message scheduler (server 2.12+ for `@at`, 2.14+
 * for repeating schedules). The server strips every `Nats-Schedule*` header
 * from the message it produces, so these never reach a worker.
 */
export const SCHEDULE_HEADER = 'Nats-Schedule'
export const SCHEDULE_TARGET_HEADER = 'Nats-Schedule-Target'
export const SCHEDULE_TIMEZONE_HEADER = 'Nats-Schedule-Time-Zone'
/** Set by the server on produced messages: the subject holding the schedule. */
export const SCHEDULER_HEADER = 'Nats-Scheduler'
/** Set by the server on produced messages; also the client's cancel verb (`purge`). */
export const SCHEDULE_NEXT_HEADER = 'Nats-Schedule-Next'

/**
 * Subject segment reserved for schedule messages.
 *
 * A schedule must live in the same stream as the subject it targets, so these
 * sit inside the queue stream rather than beside it. The segment leads with `_`
 * so it cannot collide with a queue token: `queueNameToToken` never introduces
 * a leading underscore, and a queue literally named `_schedule` would collide
 * with itself long before it reached here.
 *
 * Nothing consumes this subject, and that is load-bearing on a WorkQueue
 * stream: a consumer that acked a schedule message would delete it, and a
 * deleted schedule stops firing with no error and no advisory.
 */
export const SCHEDULE_SUBJECT_SEGMENT = '_schedule'

/**
 * Subject holding the schedule for a queue.
 *
 * Every schedule needs its own subject, because the last message on a subject
 * *is* the schedule — republishing to the same subject replaces it. For
 * repeating schedules that is exactly the update semantics we want, so `key`
 * identifies the schedule. For one-shot delayed publishes there is no such
 * identity, and reusing a subject would make two concurrent delayed jobs
 * silently overwrite each other, so an absent key gets a unique suffix.
 */
export const scheduleSubjectFor = (prefix: string, queueName: string, key?: string): string =>
  `${prefix}.${SCHEDULE_SUBJECT_SEGMENT}.${queueNameToToken(queueName)}.${
    key
      ? queueNameToToken(key)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  }`

/**
 * Durable consumer name for a queue. NATS rejects `.` in durable names, so both
 * halves have to be tokenised — the prefix as much as the queue name, since a
 * hierarchical prefix like `app.dispatch` is perfectly valid as a subject
 * and would otherwise produce a name the server refuses.
 */
export const consumerNameForQueue = (prefix: string, queueName: string): string =>
  `${queueNameToToken(prefix)}_${queueNameToToken(queueName)}`

/**
 * A JetStream message has no terminal states to report: once it is acked it is
 * removed from a work-queue stream, and once it is termed it is gone too. So a
 * message we are holding is always mid-delivery — 'active' is the only status
 * that can be observed from the message itself. Historical outcomes have to come
 * from telemetry, not from the broker.
 */
export const jsMsgStatus = (): QueueJobStatus => 'active'

/** The job's own retry limit, if the producer set one. */
export const attemptsFor = (msg: JsMsg): number | undefined => {
  const raw = msg.headers?.get(ATTEMPTS_HEADER)
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Redelivery delay for this message's next attempt, per its backoff policy. */
export const backoffFor = (msg: JsMsg): number => {
  const type = msg.headers?.get(BACKOFF_TYPE_HEADER) || undefined
  const rawBase = msg.headers?.get(BACKOFF_DELAY_HEADER)
  const base = rawBase ? Number(rawBase) : undefined
  return backoffDelayMs(
    msg.info.deliveryCount,
    type,
    Number.isFinite(base) && base! > 0 ? base : DEFAULT_BACKOFF_DELAY_MS,
  )
}

export const jsMsgMetadata = (msg: JsMsg) => ({
  attemptsMade: msg.info.deliveryCount,
  createdAt: new Date(Number(msg.info.timestampNanos) / 1_000_000),
  processedAt: new Date(),
})

/**
 * Wrap a JetStream message as a pikku QueueJob. `waitForCompletion` is absent
 * deliberately — see NatsQueueService.supportsResults.
 */
export const mapJsMsgToQueueJob = <T, R>(queueName: string, msg: JsMsg): QueueJob<T, R> => ({
  id: String(msg.seq),
  queueName,
  status: jsMsgStatus,
  data: msg.json<T>(),
  metadata: () => jsMsgMetadata(msg),
  pikkuUserId: msg.headers?.get(PIKKU_USER_ID_HEADER) || undefined,
})
