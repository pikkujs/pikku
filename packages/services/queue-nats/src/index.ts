/**
 * @module @pikku/queue-nats
 *
 * NATS JetStream queue service for Pikku.
 *
 * Mirrors `@pikku/queue-pg-boss` / `@pikku/queue-bullmq`, with one deliberate
 * difference:
 *
 *  - `supportsResults` is false. A work-queue stream deletes a message on ack,
 *    so there is nowhere for a job result — or any job history — to live.
 *    Success rates and per-job outcomes come from telemetry, not the broker.
 *
 * This package used to carry a second difference: no scheduler service, because
 * JetStream had no delayed or scheduled message primitive, so cron and delayed
 * work had to stay on a database-backed queue under the rule "Postgres owns
 * time, NATS owns delivery". That stopped being true — server 2.12 added
 * one-shot `@at` delays and 2.14 added repeating cron schedules — so NATS now
 * owns both. Requires a server on 2.14+; `NatsServiceFactory` refuses to start
 * against anything older rather than silently not scheduling.
 *
 * A database has not left the picture entirely, and shouldn't: the broker has
 * no API to list schedules and no record of whether a fire succeeded, so a
 * schedule registry and a last-fired ledger belong in one. NATS owns *when*,
 * the database owns *what is registered* and *what happened*.
 */

export { NatsServiceFactory } from './nats-service-factory.js'
export type { NatsServiceFactoryOptions } from './nats-service-factory.js'
export { NatsQueueService } from './nats-queue-service.js'
export type { DelayedPublisher } from './nats-queue-service.js'
// Backs workflow.sleep() and backoff retries, using the server's own scheduler.
// Wired automatically by NatsServiceFactory; exported for tests and for callers
// building a queue service by hand.
export { NatsDelayedPublisher } from './nats-delayed-publisher.js'
export { NatsSchedulerService, toNatsCron } from './nats-scheduler-service.js'
export { NatsQueueWorkers, mapPikkuWorkerToNats } from './nats-queue-worker.js'
// For consumers that need their own dispatch loop rather than pikku's queue
// registry — e.g. a dispatcher whose queues are shared across tenants and must
// not collide with the registry's global queue names.
export { consumeQueue } from './consume.js'
export type { ConsumeHandle, ConsumeOptions } from './consume.js'
export {
  consumerNameForQueue,
  queueNameToToken,
  subjectForQueue,
  backoffDelayMs,
  attemptsFor,
  backoffFor,
  scheduleSubjectFor,
  PIKKU_USER_ID_HEADER,
  NATS_MSG_ID_HEADER,
  ATTEMPTS_HEADER,
  BACKOFF_TYPE_HEADER,
  BACKOFF_DELAY_HEADER,
  SCHEDULE_HEADER,
  SCHEDULE_TARGET_HEADER,
  SCHEDULE_TIMEZONE_HEADER,
  SCHEDULE_NEXT_HEADER,
  SCHEDULER_HEADER,
  SCHEDULE_SUBJECT_SEGMENT,
} from './utils.js'
// Re-exported so callers that publish their own messages (a dispatcher parking
// a job on a DLQ, say) can build headers without taking a direct dependency on
// nats-core — this package is the NATS boundary.
export { headers as natsHeaders } from '@nats-io/nats-core'

// Re-export core queue types for convenience
export type {
  QueueService,
  PikkuWorkerConfig,
  PikkuJobConfig,
  QueueJob,
  JobOptions,
} from '@pikku/core/queue'
