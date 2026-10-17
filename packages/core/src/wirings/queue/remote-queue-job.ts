import { BadRequestError, PikkuMissingMetaError } from '../../errors/errors.js'
import type { Logger } from '../../services/logger.js'
import type { RemoteQueueJobData } from '../../services/remote-jobs.js'
import { QueueJobDiscardedError, runQueueJob } from './queue-runner.js'
import type { QueueJob, QueueJobStatus } from './queue.types.js'

/**
 * A dispatched job is delivered, not owned: the sender retries, so a permanent
 * failure has to read differently from a transient one. An unknown worker or a
 * discarded job answers 4xx so the sender stops; anything else propagates and
 * is delivered again.
 */
export async function pikkuRemoteQueueJobFunc(
  { logger }: { logger: Logger },
  { queueName, data, jobId, traceId }: RemoteQueueJobData
): Promise<void> {
  const job: QueueJob = {
    queueName,
    data,
    id: jobId ?? traceId ?? `remote-${Date.now()}`,
    status: async (): Promise<QueueJobStatus> => 'active',
    metadata: () => ({
      processedAt: new Date(),
      attemptsMade: 0,
      maxAttempts: undefined,
      result: undefined,
      progress: 0,
      createdAt: new Date(),
      completedAt: undefined,
      failedAt: undefined,
      error: undefined,
    }),
    waitForCompletion: async () => {
      throw new Error('remote jobs do not support waitForCompletion')
    },
  }

  try {
    await runQueueJob({ job, traceId })
  } catch (error) {
    if (
      error instanceof PikkuMissingMetaError ||
      error instanceof QueueJobDiscardedError
    ) {
      throw new BadRequestError(error.message)
    }
    logger.error(
      `remote-jobs: queue '${queueName}' failed: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}
