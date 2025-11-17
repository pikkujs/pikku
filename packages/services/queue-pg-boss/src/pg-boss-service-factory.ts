import PgBoss from 'pg-boss'
import { PgBossQueueService } from './pg-boss-queue-service.js'
import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'
import { PgBossSchedulerService } from './pg-boss-scheduler-service.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CreateInteractionServices,
} from '@pikku/core'

/**
 * Factory class for pg-boss services
 * Manages a single PgBoss instance shared across queue, worker, and scheduler services
 */
export class PgBossServiceFactory {
  private pgBoss: PgBoss
  private queueService?: PgBossQueueService
  private queueWorkers?: PgBossQueueWorkers
  private schedulerService?: PgBossSchedulerService
  private initialized = false

  constructor(optionsOrInstance: PgBoss.ConstructorOptions | string | PgBoss) {
    if (optionsOrInstance instanceof PgBoss) {
      this.pgBoss = optionsOrInstance
    } else {
      const options =
        typeof optionsOrInstance === 'string'
          ? { connectionString: optionsOrInstance }
          : optionsOrInstance
      this.pgBoss = new PgBoss(options)
    }
  }

  /**
   * Initialize the pg-boss instance
   */
  async init(): Promise<void> {
    if (!this.initialized) {
      await this.pgBoss.start()
      this.initialized = true
    }
  }

  /**
   * Get the queue service for publishing jobs
   */
  getQueueService(): PgBossQueueService {
    if (!this.queueService) {
      this.queueService = new PgBossQueueService(this.pgBoss)
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
  ): PgBossQueueWorkers {
    if (!this.queueWorkers) {
      this.queueWorkers = new PgBossQueueWorkers(
        this.pgBoss,
        singletonServices,
        createInteractionServices
      )
    }
    return this.queueWorkers
  }

  /**
   * Get the scheduler service for managing recurring tasks
   */
  getSchedulerService(): PgBossSchedulerService {
    if (!this.schedulerService) {
      this.schedulerService = new PgBossSchedulerService(this.pgBoss)
    }
    return this.schedulerService
  }

  /**
   * Close all services and the pg-boss connection
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await this.pgBoss.stop()
      this.initialized = false
    }
  }
}
