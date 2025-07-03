import PgBoss from 'pg-boss'
import type {
  QueueWorkers,
  QueueCapabilities,
  ConfigValidationResult,
  PikkuWorkerConfig,
} from '@pikku/core/queue'
import { getQueueProcessors, runQueueJob } from '@pikku/core/queue'
import {
  CoreServices,
  CoreSingletonServices,
  CreateSessionServices,
} from '@pikku/core'
import { mapPgBossJobToQueueJob } from './utils.js'

export const mapPikkuWorkerToPgBoss = (
  workerConfig?: PikkuWorkerConfig
): PgBoss.WorkOptions => {
  const workerOptions: PgBoss.WorkOptions = {}

  if (workerConfig?.batchSize !== undefined) {
    workerOptions.batchSize = workerConfig.batchSize
  }

  if (workerConfig?.pollInterval !== undefined) {
    workerOptions.pollingIntervalSeconds = Math.round(
      workerConfig.pollInterval / 1000
    )
  }

  return workerOptions
}

/**
 * pg-boss/PostgreSQL queue worker implementation
 * Supports job results, retries, and PostgreSQL-based queuing
 */
export class PgBossQueueWorkers implements QueueWorkers {
  readonly name = 'pg-boss'
  readonly supportsResults = true

  readonly capabilities: QueueCapabilities = {
    retryAttempts: true,
    retryBackoff: true,
    deadLetterQueue: true,
    concurrency: true,
    batchProcessing: true,
    priority: true,
    fifo: true,
    visibilityTimeout: true,
    messageRetention: true,
    prefetch: false, // pg-boss manages this internally
    pollInterval: true,
  }

  private pgBoss: PgBoss
  private activeWorkers = new Map<string, string>()

  constructor(
    options: PgBoss.ConstructorOptions | string,
    private singletonServices?: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<
      CoreSingletonServices,
      CoreServices,
      any
    >
  ) {
    if (typeof options === 'string') {
      // If a string is provided, treat it as the connection string
      options = { connectionString: options }
    }
    this.pgBoss = new PgBoss(options)
  }

  /**
   * Initialize pg-boss
   */
  async init(): Promise<void> {
    await this.pgBoss.start()
  }

  /**
   * Scan state and register all compatible processors
   */
  async registerQueues(): Promise<void> {
    const queueProcessors = getQueueProcessors()
    for (const [queueName, processor] of queueProcessors) {
      this.singletonServices?.logger.info(
        `Registering pg-boss queue processor: ${queueName}`
      )

      try {
        await this.pgBoss.createQueue(queueName)
        const workerId = await this.pgBoss.work<any>(
          processor.queueName,
          {
            ...mapPikkuWorkerToPgBoss(processor.config),
            includeMetadata: true,
          },
          async ([job]) => {
            if (!this.singletonServices) {
              throw new Error('Singleton services not available')
            }
            if (!job) {
              this.singletonServices.logger.warn(
                `No job received for queue ${queueName}`
              )
              return
            }
            await runQueueJob({
              singletonServices: this.singletonServices,
              createSessionServices: this.createSessionServices,
              job: mapPgBossJobToQueueJob(job, this.pgBoss),
            })
          }
        )
        this.activeWorkers.set(queueName, workerId)

        this.singletonServices?.logger.info(
          `Successfully registered pg-boss worker: ${queueName}`
        )
      } catch (error) {
        this.singletonServices?.logger.error(
          `Failed to register pg-boss worker ${queueName}:`,
          error
        )
      }
    }
  }

  /**
   * Close all workers and connections
   */
  async close(): Promise<void> {
    await this.pgBoss.stop()
  }

  /**
   * Validate config and return warnings for unsupported features
   */
  validateConfig(config: PikkuWorkerConfig): ConfigValidationResult {
    const applied: Partial<PikkuWorkerConfig> = {}
    const ignored: Partial<PikkuWorkerConfig> = {}
    const warnings: string[] = []
    const fallbacks: { [key: string]: any } = {}

    if (config.batchSize !== undefined) {
      applied.batchSize = config.batchSize
    }

    if (config.pollInterval !== undefined) {
      applied.pollInterval = config.pollInterval
    }

    if (config.visibilityTimeout !== undefined) {
      applied.visibilityTimeout = config.visibilityTimeout
    }

    // Partially supported configurations with fallbacks
    if (config.removeOnComplete !== undefined) {
      applied.removeOnComplete = config.removeOnComplete
      fallbacks.removeOnComplete = 'Mapped to expireInSeconds'
    }

    if (config.removeOnFail !== undefined) {
      applied.removeOnFail = config.removeOnFail
      fallbacks.removeOnFail = 'Mapped to expireInSeconds'
    }

    // Unsupported configurations
    if (config.name !== undefined) {
      ignored.name = config.name
      warnings.push('Worker names are not supported in pg-boss')
    }

    if (config.autorun !== undefined) {
      ignored.autorun = config.autorun
      warnings.push('Autorun is not configurable in pg-boss (always enabled)')
    }

    if (config.lockDuration !== undefined) {
      ignored.lockDuration = config.lockDuration
      warnings.push('Lock duration is managed by visibilityTimeout in pg-boss')
    }

    if (config.drainDelay !== undefined) {
      ignored.drainDelay = config.drainDelay
      warnings.push('Drain delay is not configurable in pg-boss')
    }

    if (config.maxStalledCount !== undefined) {
      ignored.maxStalledCount = config.maxStalledCount
      warnings.push('Max stalled count is not configurable in pg-boss')
    }

    if (config.prefetch !== undefined) {
      ignored.prefetch = config.prefetch
      warnings.push('Prefetch is managed internally by pg-boss')
    }

    return {
      applied,
      ignored,
      warnings,
      fallbacks,
    }
  }
}
