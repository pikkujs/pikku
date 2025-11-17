import PgBoss from 'pg-boss'
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
import {
  CoreServices,
  CoreSingletonServices,
  CreateInteractionServices,
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

  /**
   * Configuration mapping rules for pg-boss
   * This defines how Pikku worker configs map to pg-boss configurations
   */
  readonly configMappings: QueueConfigMapping = {
    // Configurations that are directly supported
    supported: {
      batchSize: {
        queueProperty: 'batchSize',
        description: 'Number of jobs to process in a single batch',
      },
      pollInterval: {
        queueProperty: 'pollingIntervalSeconds',
        transform: (value: number) => Math.round(value / 1000),
        description:
          'How often to poll for new jobs (converted from ms to seconds)',
      },
    },

    // Configurations that are not supported but have reasonable explanations
    unsupported: {
      name: {
        reason: 'Worker names are not supported in pg-boss',
        explanation:
          'pg-boss identifies workers by their queue name and process, not custom names',
      },
      autorun: {
        reason: 'Autorun is not configurable in pg-boss (always enabled)',
        explanation:
          'pg-boss workers automatically start processing when created',
      },
      lockDuration: {
        reason: 'Lock duration is managed differently in pg-boss',
        explanation:
          'pg-boss uses job-level expiration instead of worker-level locks',
      },
      drainDelay: {
        reason: 'Drain delay is not configurable in pg-boss',
        explanation: 'pg-boss handles graceful shutdown internally',
      },
      maxStalledCount: {
        reason: 'Max stalled count is not configurable in pg-boss',
        explanation:
          'pg-boss handles stalled jobs through its built-in retry mechanism',
      },
      prefetch: {
        reason: 'Prefetch is managed internally by pg-boss',
        explanation:
          'pg-boss optimizes job fetching automatically based on batch size',
      },
      visibilityTimeout: {
        reason: "Visibility timeout concept doesn't apply to pg-boss",
        explanation:
          'pg-boss uses PostgreSQL locks and job expiration instead of visibility timeout',
      },
    },

    // Configurations that have partial support or workarounds
    fallbacks: {
      removeOnComplete: {
        reason: 'Job retention is managed through pg-boss archival system',
        explanation:
          'pg-boss automatically archives completed jobs based on database settings',
        fallbackValue: 'Managed by pg-boss database archival',
      },
      removeOnFail: {
        reason:
          'Failed job retention is managed through pg-boss archival system',
        explanation:
          'pg-boss automatically archives failed jobs based on database settings',
        fallbackValue: 'Managed by pg-boss database archival',
      },
    },
  }

  private pgBoss: PgBoss
  private activeWorkers = new Map<string, string>()

  constructor(
    pgBoss: PgBoss,
    private singletonServices: CoreSingletonServices,
    private createInteractionServices?: CreateInteractionServices<
      CoreSingletonServices,
      CoreServices,
      any
    >
  ) {
    this.pgBoss = pgBoss
  }

  /**
   * Scan state and register all compatible processors
   */
  async registerQueues(): Promise<Record<string, ConfigValidationResult[]>> {
    return await registerQueueWorkers(
      this.configMappings,
      this.singletonServices.logger,
      async (queueName, processor) => {
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
            try {
              await runQueueJob({
                singletonServices: this.singletonServices,
                createInteractionServices: this.createInteractionServices,
                job: mapPgBossJobToQueueJob(job, this.pgBoss),
              })
            } catch (error: unknown) {
              if (error instanceof QueueJobFailedError) {
                // Let pg-boss handle this as a failed job
                throw new Error(error.message)
              } else if (error instanceof QueueJobDiscardedError) {
                // For pg-boss, complete the job successfully to discard it
                this.singletonServices.logger.info(
                  `PgBoss job ${job.id} discarded: ${error.message}`
                )
                return // Successfully "completed" by discarding
              }
              throw error
            }
          }
        )
        this.activeWorkers.set(queueName, workerId)
      }
    )
  }
}
