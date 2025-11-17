import { ConnectionOptions } from 'bullmq'
import { BullQueueService } from './bull-queue-service.js'
import { BullQueueWorkers } from './bull-queue-worker.js'
import { BullSchedulerService } from './bull-scheduler-service.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CreateInteractionServices,
} from '@pikku/core'

/**
 * Factory class for BullMQ services
 * Manages Redis connection options shared across queue, worker, and scheduler services
 */
export class BullServiceFactory {
  private queueService?: BullQueueService
  private queueWorkers?: BullQueueWorkers
  private schedulerService?: BullSchedulerService

  constructor(private redisConnectionOptions: ConnectionOptions = {}) {}

  /**
   * Initialize - no-op for BullMQ as connections are lazy
   */
  async init(): Promise<void> {
    // No-op - BullMQ creates connections lazily
  }

  /**
   * Get the queue service for publishing jobs
   */
  getQueueService(): BullQueueService {
    if (!this.queueService) {
      this.queueService = new BullQueueService(this.redisConnectionOptions)
    }
    return this.queueService
  }

  /**
   * Get the queue workers for processing jobs
   */
  getQueueWorkers(
    singletonServices: CoreSingletonServices,
    createInteractionServices?: CreateInteractionServices<
      CoreSingletonServices,
      CoreServices,
      any
    >
  ): BullQueueWorkers {
    if (!this.queueWorkers) {
      this.queueWorkers = new BullQueueWorkers(
        this.redisConnectionOptions,
        singletonServices,
        createInteractionServices
      )
    }
    return this.queueWorkers
  }

  /**
   * Get the scheduler service for managing delayed tasks
   */
  getSchedulerService(): BullSchedulerService {
    if (!this.schedulerService) {
      this.schedulerService = new BullSchedulerService(
        this.redisConnectionOptions
      )
    }
    return this.schedulerService
  }

  /**
   * Close all services
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = []

    if (this.queueService) {
      // BullQueueService doesn't have close method currently
    }

    if (this.queueWorkers) {
      closePromises.push(this.queueWorkers.close())
    }

    if (this.schedulerService) {
      closePromises.push(this.schedulerService.close())
    }

    await Promise.all(closePromises)
  }
}
