import { QueueJob, QueueJobStatus } from '@pikku/core/queue'
import { ConnectionOptions, Job, QueueEvents } from 'bullmq'

/**
 * Map Bull job state to our queue job status
 */
const mapBullStateToStatus = (state: string): QueueJobStatus => {
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

/**
 * Map Bull job to QueueJob interface
 */
export const mapBullJobToQueueJob = async <In, Out>(
  bullJob: Job,
  redisConnection: ConnectionOptions | undefined,
  queueEventsMap: Map<string, QueueEvents>
): Promise<QueueJob<In, Out>> => {
  return {
    queueName: bullJob.name,
    id: bullJob.id || '',
    data: bullJob.data,
    result: bullJob.returnvalue as Out,
    status: async () => mapBullStateToStatus(await bullJob.getState()),
    waitForCompletion: async (ttl?: number): Promise<Out> => {
      let queueEvents = queueEventsMap.get(bullJob.queueName)
      if (!queueEvents) {
        queueEvents = new QueueEvents(
          bullJob.queueName,
          redisConnection ? { connection: redisConnection } : undefined
        )
        queueEventsMap.set(bullJob.queueName, queueEvents)
        await queueEvents.waitUntilReady()
      }
      return await bullJob.waitUntilFinished(queueEvents, ttl)
    },
    metadata: () => ({
      progress: bullJob.progress,
      attemptsMade: bullJob.attemptsMade,
      maxAttempts: bullJob.opts.attempts || 1,
      createdAt: new Date(bullJob.timestamp),
      processedAt: bullJob.processedOn
        ? new Date(bullJob.processedOn)
        : undefined,
      completedAt: bullJob.finishedOn
        ? new Date(bullJob.finishedOn)
        : undefined,
      failedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
      error: bullJob.failedReason,
    }),
  }
}
