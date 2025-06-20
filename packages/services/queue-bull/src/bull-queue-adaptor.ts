import Bull from 'bull'
import type {
  QueueAdaptor,
  PikkuQueueConfig,
  QueueCapabilities,
  ConfigValidationResult,
  JobOptions,
} from '@pikku/core/queue'
import { getQueueProcessors, runQueueJob } from '@pikku/core/queue'
import {
  CoreServices,
  CoreSingletonServices,
  CreateSessionServices,
} from '@pikku/core'
import { BullQueueService } from './bull-queue-service.js'

/**
 * Bull/Redis queue service implementation
 * Supports job results, retries, and most queue features
 */
export class BullQueueAdaptor extends BullQueueService implements QueueAdaptor {
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

  constructor(
    redisConfig: Bull.QueueOptions | undefined,
    private singletonServices: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<
      CoreSingletonServices,
      CoreServices
    >
  ) {
    super(redisConfig)
  }

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
        // Translate config to Bull format
        const bullConfig = this.translateConfig(processor.config || {})

        // Create the queue
        const queue = await this.createQueue(processor.queueName, bullConfig)

        queue.process(processor.queueName, async (job: Bull.Job) => {
          return await runQueueJob({
            singletonServices: this.singletonServices,
            createSessionServices: this.createSessionServices,
            job: await this.mapBullJobToQueueJob(job),
          })
        })

        this.singletonServices.logger.info(
          `Successfully registered Bull processor: ${queueName}`
        )
      } catch (error) {
        this.singletonServices.logger.error(
          `Failed to register Bull processor ${queueName}:`,
          error
        )
      }
    }
  }

  /**
   * Translate Pikku config to Bull job options
   */
  translateConfig(pikkuConfig: PikkuQueueConfig): Bull.JobOptions {
    const bullConfig: Bull.JobOptions = {}

    // Retry configuration
    if (pikkuConfig.retryAttempts !== undefined) {
      bullConfig.attempts = pikkuConfig.retryAttempts
    }

    if (pikkuConfig.retryBackoff && pikkuConfig.retryDelay) {
      const backoffType =
        pikkuConfig.retryBackoff === 'exponential' ? 'exponential' : 'fixed'
      bullConfig.backoff = {
        type: backoffType,
        delay: pikkuConfig.retryDelay,
      }
    }

    // Job retention
    if (pikkuConfig.removeOnComplete !== undefined) {
      bullConfig.removeOnComplete = pikkuConfig.removeOnComplete
    }

    if (pikkuConfig.removeOnFail !== undefined) {
      bullConfig.removeOnFail = pikkuConfig.removeOnFail
    }

    // Priority support
    if (pikkuConfig.priority) {
      // Note: Actual priority values will be set per job, not per queue
      // This just enables priority support
    }

    return bullConfig
  }

  /**
   * Close all queues and connections
   */
  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.queues.values()).map((queue) => queue.close())
    )
    this.queues.clear()
  }

  /**
   * Translate JobOptions to Bull.JobOptions
   */
  translateJobOptions(options?: JobOptions): Bull.JobOptions {
    if (!options) return {}

    const bullOptions: Bull.JobOptions = {}

    if (options.priority !== undefined) bullOptions.priority = options.priority
    if (options.delay !== undefined) bullOptions.delay = options.delay
    if (options.attempts !== undefined) bullOptions.attempts = options.attempts
    // TODO: Handle backoff options properly
    // if (options.backoff !== undefined) bullOptions.backoff = options.backoff
    if (options.removeOnComplete !== undefined)
      bullOptions.removeOnComplete = options.removeOnComplete
    if (options.removeOnFail !== undefined)
      bullOptions.removeOnFail = options.removeOnFail
    if (options.jobId !== undefined) bullOptions.jobId = options.jobId

    return bullOptions
  }

  /**
   * Validate config and return warnings for unsupported features
   */
  validateAndTranslateConfig(config: PikkuQueueConfig): ConfigValidationResult {
    const applied: Partial<PikkuQueueConfig> = {}
    const ignored: Partial<PikkuQueueConfig> = {}
    const warnings: string[] = []
    const fallbacks: { [key: string]: any } = {}

    // Supported configurations
    if (config.retryAttempts !== undefined) {
      applied.retryAttempts = config.retryAttempts
    }

    if (config.retryBackoff !== undefined) {
      applied.retryBackoff = config.retryBackoff
    }

    if (config.retryDelay !== undefined) {
      applied.retryDelay = config.retryDelay
    }

    if (config.removeOnComplete !== undefined) {
      applied.removeOnComplete = config.removeOnComplete
    }

    if (config.removeOnFail !== undefined) {
      applied.removeOnFail = config.removeOnFail
    }

    if (config.priority !== undefined) {
      applied.priority = config.priority
    }

    if (config.fifo !== undefined) {
      applied.fifo = config.fifo
    }

    // Unsupported configurations with warnings
    if (config.deadLetterQueue !== undefined) {
      ignored.deadLetterQueue = config.deadLetterQueue
      warnings.push(
        'Bull does not support explicit dead letter queues. Failed jobs are stored in the failed jobs list.'
      )
    }

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

    // Concurrency is handled at the queue level during processing
    if (config.concurrency !== undefined) {
      applied.concurrency = config.concurrency
      warnings.push(
        'Concurrency must be set during queue.process() call, not in job options.'
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
