/**
 * @module @pikku/queue-bull
 *
 * Bull/Redis queue service for Pikku
 * Provides job results, retries, priorities, and most queue features
 */

export { BullQueueService } from './bull-queue-service.js'

// Re-export core queue types for convenience
export type {
  QueueService,
  PikkuQueueConfig,
  QueueCapabilities,
  QueueJob,
  JobOptions,
} from '@pikku/core/queue'
