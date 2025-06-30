import {
  JobOptions,
  PikkuWorkerConfig,
  QueueJob,
  QueueJobStatus,
} from '@pikku/core/queue'
import { type Job, QueueEvents, type JobsOptions } from 'bullmq'

/**
 * Map Bull job to QueueJob interface
 */
export const mapBullJobToQueueJob = async <In, Out>(
  bullJob: Job
): Promise<QueueJob<In, Out>> => {
  return {
    queueName: bullJob.name,
    id: bullJob.id || '',
    data: bullJob.data,
    result: bullJob.returnvalue as Out,
    status: async () => mapBullStateToStatus(await bullJob.getState()),
    waitForCompletion: async (): Promise<Out> => {
      // TODO: QueueEvents should be created once per queue, not per job
      const queueEvents = new QueueEvents(bullJob.name)
      return await bullJob.waitUntilFinished(queueEvents)
    },
    progress: Number(bullJob.progress),
    attemptsMade: bullJob.attemptsMade,
    maxAttempts: bullJob.opts.attempts || 1,
    createdAt: new Date(bullJob.timestamp),
    processedAt: bullJob.processedOn
      ? new Date(bullJob.processedOn)
      : undefined,
    completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
    failedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
    error: bullJob.failedReason,
  }
}

/**
 * Map Bull job state to our queue job status
 */
export const mapBullStateToStatus = (state: string): QueueJobStatus => {
  switch (state) {
    case 'waiting':
      return 'waiting'
    case 'active':
      return 'active'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'delayed':
      return 'delayed'
    default:
      return 'waiting'
  }
}
