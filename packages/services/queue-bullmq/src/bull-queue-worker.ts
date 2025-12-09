import Bull, {
  ConnectionOptions,
  WorkerOptions,
  Worker,
  QueueEvents,
} from 'bullmq'
import type {
  QueueWorkers,
  PikkuWorkerConfig,
  QueueConfigMapping,
  ConfigValidationResult,
} from '@pikku/core/queue'
import {
  runQueueJob,
  registerQueueWorkers,
  QueueJobFailedError,
  QueueJobDiscardedError,
} from '@pikku/core/queue'
import type { CoreSingletonServices, CreateWireServices } from '@pikku/core'
import { mapBullJobToQueueJob } from './utils.js'

export const mapPikkuWorkerToBull = (
  workerConfig?: PikkuWorkerConfig
): Omit<WorkerOptions, 'connection'> => {
  const workerOptions: Omit<WorkerOptions, 'connection'> = {}

  // Direct mappings
  if (workerConfig?.name !== undefined) {
    workerOptions.name = workerConfig.name
  }

  if (workerConfig?.batchSize !== undefined) {
    workerOptions.concurrency = workerConfig.batchSize
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

  /**
   * Configuration mapping rules for BullMQ
   * This defines how Pikku worker configs map to BullMQ configurations
   */
  readonly configMappings: QueueConfigMapping = {
    // Configurations that are directly supported
    supported: {
      name: {
        queueProperty: 'name',
        description: 'Worker name for identification and monitoring',
      },
      batchSize: {
        queueProperty: 'concurrency',
        description:
          "Number of jobs to process concurrently, this is Bull's concurrency setting",
      },
      autorun: {
        queueProperty: 'autorun',
        description: 'Whether to start processing jobs automatically',
      },
      lockDuration: {
        queueProperty: 'lockDuration',
        description: 'Duration of job lock in milliseconds',
      },
      drainDelay: {
        queueProperty: 'drainDelay',
        description: 'Delay when queue is empty before polling again',
      },
      maxStalledCount: {
        queueProperty: 'maxStalledCount',
        description:
          'Maximum number of times a job can be recovered from stalled state',
      },
      removeOnComplete: {
        queueProperty: 'removeOnComplete',
        description: 'Number of completed jobs to keep for inspection',
      },
      removeOnFail: {
        queueProperty: 'removeOnFail',
        description: 'Number of failed jobs to keep for inspection',
      },
    },

    // Configurations that are not supported
    unsupported: {
      visibilityTimeout: {
        reason: 'Bull does not use visibility timeout',
        explanation:
          'BullMQ locks jobs during processing instead of using visibility timeouts',
      },
      pollInterval: {
        reason: 'Bull is push-based and does not use polling intervals',
        explanation:
          'BullMQ uses Redis pub/sub for real-time job notifications',
      },
      prefetch: {
        reason: 'Bull manages job prefetching internally',
        explanation:
          'BullMQ optimizes job fetching automatically based on concurrency settings',
      },
    },

    // No fallback configurations for BullMQ currently
    fallbacks: {},
  }

  private workers = new Map<string, Bull.Worker>()
  private queueEvents = new Map<string, QueueEvents>()

  constructor(
    private redisConnectionOptions: ConnectionOptions,
    private singletonServices: CoreSingletonServices,
    private createWireServices?: CreateWireServices
  ) {}

  /**
   * Scan state and register all compatible processors
   */
  async registerQueues(): Promise<Record<string, ConfigValidationResult[]>> {
    return await registerQueueWorkers(
      this.configMappings,
      this.singletonServices.logger,
      async (queueName, processor) => {
        const worker = new Worker(
          processor.queueName,
          async (job: Bull.Job) => {
            try {
              return await runQueueJob({
                singletonServices: this.singletonServices,
                createWireServices: this.createWireServices,
                job: await mapBullJobToQueueJob(
                  job,
                  this.redisConnectionOptions,
                  this.queueEvents
                ),
                updateProgress: async (progress) => {
                  await job.updateProgress(progress)
                },
              })
            } catch (error) {
              if (error instanceof QueueJobFailedError) {
                // Let BullMQ handle this as a failed job
                throw new Error(error.message)
              } else if (error instanceof QueueJobDiscardedError) {
                return // Don't throw, job is discarded, which I guess is considered
                // a successful job removal
              }
              throw error
            }
          },
          {
            connection: this.redisConnectionOptions,
            ...mapPikkuWorkerToBull(processor.config),
          }
        )
        worker.on('error', console.error)
        this.workers.set(queueName, worker)
      }
    )
  }

  /**
   * Close all queues and connections
   */
  async close(): Promise<void> {
    await Promise.all([
      ...Array.from(this.workers.values()).map((worker) => worker.close()),
      ...Array.from(this.queueEvents.values()).map((queueEvents) =>
        queueEvents.close()
      ),
    ])
    this.workers.clear()
    this.queueEvents.clear()
  }
}
