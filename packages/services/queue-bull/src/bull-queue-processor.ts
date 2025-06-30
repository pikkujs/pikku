import Bull, { ConnectionOptions, WorkerOptions, Worker } from 'bullmq'
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
import { mapBullJobToQueueJob } from './utils.js'

export const mapPikkuWorkerToBull = (
  workerConfig?: PikkuWorkerConfig
): Omit<WorkerOptions, 'connection'> => {
  const workerOptions: Omit<WorkerOptions, 'connection'> = {}

  // Direct mappings
  if (workerConfig?.name !== undefined) {
    workerOptions.name = workerConfig.name
  }

  if (workerConfig?.concurrency !== undefined) {
    workerOptions.concurrency = workerConfig.concurrency
  }

  if (workerConfig?.autorun !== undefined) {
    workerOptions.autorun = workerConfig.autorun
  }

  if (workerConfig?.lockDuration !== undefined) {
    workerOptions.lockDuration = workerConfig.lockDuration
  }

  if (workerConfig?.drainDelay !== undefined) {
    workerOptions.drainDelay = workerConfig.drainDelay
  }

  if (workerConfig?.maxStalledCount !== undefined) {
    workerOptions.maxStalledCount = workerConfig.maxStalledCount
  }

  // Job retention
  if (workerConfig?.removeOnComplete !== undefined) {
    workerOptions.removeOnComplete = { count: workerConfig.removeOnComplete }
  }

  if (workerConfig?.removeOnFail !== undefined) {
    workerOptions.removeOnFail = { count: workerConfig.removeOnFail }
  }

  return workerOptions
}
/**
 * Bull/Redis queue service implementation
 * Supports job results, retries, and most queue features
 */
export class BullQueueWorkers implements QueueWorkers {
  readonly name = 'bull'
  readonly supportsResults = true

  readonly capabilities: QueueCapabilities = {
    retryAttempts: true,
    retryBackoff: true,
    deadLetterQueue: false, // Bull handles failures differently
    concurrency: true,
    batchProcessing: false, // Bull processes jobs individually
    priority: true,
    fifo: true,
    visibilityTimeout: false, // Redis/Bull doesn't use visibility timeout
    messageRetention: true,
    prefetch: false, // Bull manages this internally
    pollInterval: false, // Bull is push-based, not poll-based
  }

  private workers = new Map<string, Bull.Worker>()

  constructor(
    private redisConnection: ConnectionOptions,
    private singletonServices: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<
      CoreSingletonServices,
      CoreServices,
      any
    >
  ) {}

  /**
   * Scan state and register all compatible processors
   */
  async registerQueues(): Promise<void> {
    const queueProcessors = getQueueProcessors()
    for (const [queueName, processor] of queueProcessors) {
      this.singletonServices.logger.info(
        `Registering Bull queue processor: ${queueName}`
      )

      try {
        const worker = new Worker(
          processor.queueName,
          async (job: Bull.Job) => {
            return await runQueueJob({
              singletonServices: this.singletonServices,
              createSessionServices: this.createSessionServices,
              job: await mapBullJobToQueueJob(job),
            })
          },
          {
            connection: this.redisConnection,
            ...mapPikkuWorkerToBull(processor.config),
          }
        )
        worker.on('error', console.error)

        this.workers.set(queueName, worker)

        this.singletonServices.logger.info(
          `Successfully registered Bull worker: ${queueName}`
        )
      } catch (error) {
        this.singletonServices.logger.error(
          `Failed to register Bull worker ${queueName}:`,
          error
        )
      }
    }
  }

  /**
   * Close all queues and connections
   */
  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((worker) => worker.close())
    )
    this.workers.clear()
  }

  /**
   * Validate config and return warnings for unsupported features
   */
  validateConfig(config: PikkuWorkerConfig): ConfigValidationResult {
    const applied: Partial<PikkuWorkerConfig> = {}
    const ignored: Partial<PikkuWorkerConfig> = {}
    const warnings: string[] = []
    const fallbacks: { [key: string]: any } = {}

    // Supported configurations
    if (config.removeOnComplete !== undefined) {
      applied.removeOnComplete = config.removeOnComplete
    }

    if (config.removeOnFail !== undefined) {
      applied.removeOnFail = config.removeOnFail
    }

    // Concurrency is handled at the queue level during processing
    if (config.concurrency !== undefined) {
      applied.concurrency = config.concurrency
      warnings.push(
        'Concurrency must be set during queue.process() call, not in job options.'
      )
    }

    // Unsupported configurations with warnings
    if (config.batchSize !== undefined) {
      ignored.batchSize = config.batchSize
      warnings.push(
        'Bull processes jobs individually. Batch processing is not supported.'
      )
    }

    if (config.visibilityTimeout !== undefined) {
      ignored.visibilityTimeout = config.visibilityTimeout
      warnings.push(
        'Bull does not use visibility timeout. Jobs are locked during processing.'
      )
    }

    if (config.pollInterval !== undefined) {
      ignored.pollInterval = config.pollInterval
      warnings.push('Bull is push-based and does not use polling intervals.')
    }

    if (config.prefetch !== undefined) {
      ignored.prefetch = config.prefetch
      warnings.push(
        'Bull manages job prefetching internally. This setting is ignored.'
      )
    }

    return {
      applied,
      ignored,
      warnings,
      fallbacks,
    }
  }
}
