import { ConnectionOptions } from 'bullmq'
import { BullQueueService } from './bull-queue-service.js'
import { BullQueueWorkers } from './bull-queue-worker.js'
import { BullSchedulerService } from './bull-scheduler-service.js'
import type { CoreSingletonServices, CreateWireServices } from '@pikku/core'
import { createQueueJobRunner } from '@pikku/core/queue'
import { createSchedulerRuntimeHandlers } from '@pikku/core/scheduler'

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
    createWireServices?: CreateWireServices
  ): BullQueueWorkers {
    if (!this.queueWorkers) {
      this.queueWorkers = new BullQueueWorkers(this.redisConnectionOptions)
    }
    this.queueWorkers.setJobRunner(
      createQueueJobRunner({ singletonServices, createWireServices }),
      singletonServices.logger
    )
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

  setSchedulerRuntime(
    singletonServices: CoreSingletonServices,
    createWireServices?: CreateWireServices
  ): void {
    this.getSchedulerService().setServices(
      createSchedulerRuntimeHandlers({
        singletonServices,
        createWireServices,
      })
    )
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

  /**
   * Alias for close() - used by stopSingletonServices
   */
  async stop(): Promise<void> {
    await this.close()
  }
}
