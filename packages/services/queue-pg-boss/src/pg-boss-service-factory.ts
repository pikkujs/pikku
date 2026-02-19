import { PgBoss, type ConstructorOptions } from 'pg-boss'
import { PgBossQueueService } from './pg-boss-queue-service.js'
import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'
import { PgBossSchedulerService } from './pg-boss-scheduler-service.js'
import type { Logger } from '@pikku/core/services'
import type { RunFunction } from '@pikku/core/function'

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

  constructor(optionsOrInstance: ConstructorOptions | string | PgBoss) {
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
    runFunction: RunFunction,
    logger: Logger
  ): PgBossQueueWorkers {
    if (!this.queueWorkers) {
      this.queueWorkers = new PgBossQueueWorkers(this.pgBoss, logger)
    }
    this.queueWorkers.setPikkuFunctionRunner(runFunction)
    return this.queueWorkers
  }

  /**
   * Get the scheduler service for managing recurring tasks
   */
  getSchedulerService(logger: Logger): PgBossSchedulerService {
    if (!this.schedulerService) {
      this.schedulerService = new PgBossSchedulerService(this.pgBoss, logger)
    }
    return this.schedulerService
  }

  setSchedulerRuntime(runFunction: RunFunction, logger: Logger): void {
    this.getSchedulerService(logger).setPikkuFunctionRunner(runFunction)
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

  /**
   * Alias for close() - used by stopSingletonServices
   */
  async stop(): Promise<void> {
    await this.close()
  }
}
