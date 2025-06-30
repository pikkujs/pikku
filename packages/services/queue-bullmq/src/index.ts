/**
 * @module @pikku/queue-bullmq
 *
 * Bull/Redis queue service for Pikku
 * Provides job results, retries, priorities, and most queue features
 */

export { BullQueueService } from './bull-queue-service.js'
export { BullQueueWorkers } from './bull-queue-worker.js'

// Re-export core queue types for convenience
export type {
  QueueService,
  PikkuWorkerConfig,
  PikkuJobConfig,
  QueueCapabilities,
  QueueJob,
  JobOptions,
} from '@pikku/core/queue'
