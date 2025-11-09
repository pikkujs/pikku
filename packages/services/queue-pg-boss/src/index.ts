/**
 * @module @pikku/queue-pg-boss
 *
 * PostgreSQL queue service for Pikku using pg-boss
 * Provides job results, retries, priorities, and PostgreSQL-based queuing
 */

export { PgBossServiceFactory } from './pg-boss-service-factory.js'
export { PgBossQueueService } from './pg-boss-queue-service.js'
export { PgBossQueueWorkers } from './pg-boss-queue-worker.js'
export { PgBossSchedulerService } from './pg-boss-scheduler-service.js'

// Re-export core queue types for convenience
export type {
  QueueService,
  PikkuWorkerConfig,
  PikkuJobConfig,
  QueueJob,
  JobOptions,
} from '@pikku/core/queue'
