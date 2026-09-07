import { BadRequestError, PikkuMissingMetaError } from '../errors/errors.js'
import { QueueJobDiscardedError, runQueueJob } from '../wirings/queue/queue-runner.js'
import type { QueueJob, QueueJobStatus } from '../wirings/queue/queue.types.js'
import {
  ScheduledTaskNotFoundError,
  runScheduledTask,
} from '../wirings/scheduler/scheduler-runner.js'
import type { Logger } from './logger.js'

/** The variable holding the shared secret every remote job must present. */
export const REMOTE_JOBS_SECRET_VARIABLE = 'PIKKU_DISPATCH_SECRET'

export const REMOTE_JOBS_SECRET_HEADER = 'x-pikku-dispatch'

export const REMOTE_QUEUE_JOB_PATH = '/__pikku/queue-job'

export const REMOTE_SCHEDULER_JOB_PATH = '/__pikku/scheduler-job'

export interface RemoteQueueJobData {
  queueName: string
  data?: unknown
  jobId?: string
  traceId?: string
}

export interface RemoteScheduledJobData {
  taskName: string
}

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

export async function pikkuRemoteScheduledJobFunc(
  { logger }: { logger: Logger },
  { taskName }: RemoteScheduledJobData
): Promise<void> {
  try {
    await runScheduledTask({ name: taskName, traceId: `cron-${taskName}` })
  } catch (error) {
    if (error instanceof ScheduledTaskNotFoundError) {
      throw new BadRequestError(error.message)
    }
    logger.error(
      `remote-jobs: task '${taskName}' failed: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}
