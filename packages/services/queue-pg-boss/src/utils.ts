import type { QueueJob, QueueJobStatus } from '@pikku/core/queue'
import type { PgBoss, JobWithMetadata } from 'pg-boss'

/**
 * Map pg-boss job state to our queue job status
 */
const mapPgBossStateToStatus = (state: string): QueueJobStatus => {
  switch (state) {
    case 'created':
    case 'retry':
      return 'waiting'
    case 'active':
      return 'active'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'failed'
    default:
      return 'waiting'
  }
}

/**
 * Map pg-boss job to QueueJob interface
 */
export const mapPgBossJobToQueueJob = <In, Out>(
  pgBossJob: JobWithMetadata<In>,
  pgBossInstance: PgBoss
): QueueJob<In, Out> => {
  return {
    queueName: pgBossJob.name,
    id: pgBossJob.id || '',
    data: pgBossJob.data,
    status: async () => {
      const jobWithState = await pgBossInstance.getJobById(
        pgBossJob.name,
        pgBossJob.id
      )
      return mapPgBossStateToStatus(jobWithState?.state || 'created')
    },
    waitForCompletion: async (ttl?: number): Promise<Out> => {
      // pg-boss doesn't have a built-in waitForCompletion, so we'll poll
      const startTime = Date.now()
      const timeout = ttl || 30000 // 30 seconds default

      while (Date.now() - startTime < timeout) {
        const job = await pgBossInstance.getJobById(
          pgBossJob.name,
          pgBossJob.id
        )
        if (job?.state === 'completed') {
          return job.output as Out
        }
        if (job?.state === 'failed' || job?.state === 'cancelled') {
          throw new Error(`Job failed: ${JSON.stringify(job.output)}`)
        }
        // Wait 100ms before polling again
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      throw new Error('Job did not complete within timeout')
    },
    metadata: () => {
      return {
        progress: 0, // pg-boss doesn't have built-in progress tracking
        attemptsMade: pgBossJob.retryCount || 0,
        maxAttempts: pgBossJob.retryLimit || 1,
        createdAt: pgBossJob.createdOn
          ? new Date(pgBossJob.createdOn)
          : new Date(),
        processedAt: pgBossJob.startedOn
          ? new Date(pgBossJob.startedOn)
          : undefined,
        completedAt: pgBossJob.completedOn
          ? new Date(pgBossJob.completedOn)
          : undefined,
        failedAt:
          pgBossJob.state === 'failed' && pgBossJob.completedOn
            ? new Date(pgBossJob.completedOn)
            : undefined,
        error: (pgBossJob.data as any).error,
      }
    },
  }
}
