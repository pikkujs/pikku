import { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import { runQueueJob } from '@pikku/core/queue'
import type {
  CoreSingletonServices,
  CreateSessionServices,
  QueueJob,
  QueueJobStatus,
} from '@pikku/core'

/**
 * Enhanced version with additional SQS-specific features
 */
export function mapSQSRecordToQueueJob(
  record: SQSRecord,
  maxAttempts?: number
): QueueJob {
  let data: any

  try {
    data = JSON.parse(record.body)
  } catch {
    data = record.body
  }

  if (!record.eventSourceARN) {
    throw new Error('SQS record does not have eventSourceARN')
  }

  const queueName = record.eventSourceARN.split(':').pop()!

  const job: QueueJob = {
    queueName,
    data,
    id: record.messageId,
    status: async () => 'active' as QueueJobStatus,
    metadata: () => ({
      processedAt: new Date(),
      attemptsMade: parseInt(record.attributes.ApproximateReceiveCount) - 1,
      maxAttempts,
      result: undefined,
      progress: 0,
      createdAt: new Date(parseInt(record.attributes.SentTimestamp)),
      completedAt: undefined,
      failedAt: undefined,
      error: undefined,
    }),
    waitForCompletion: async () => {
      throw new Error(
        'SQS does not support waitForCompletion - jobs are fire-and-forget'
      )
    },
  }
  return job
}

/**
 * Create an SQS handler that processes queue jobs using Pikku
 */
export const runSQSQueueWorker = async (
  singletonServices: CoreSingletonServices,
  createSessionServices: CreateSessionServices<any, any, any> | undefined,
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  console.log(JSON.stringify(event, null, 2))
  const jobs = event.Records.map(mapSQSRecordToQueueJob)

  // Process all jobs in parallel
  const results = await Promise.allSettled(
    jobs.map((job) =>
      runQueueJob({
        singletonServices,
        createSessionServices,
        job,
      })
    )
  )

  // Log any failures but don't throw (SQS will handle retries)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      singletonServices.logger.error(
        `Failed to process SQS message ${jobs[index]!.id}:`,
        result.reason
      )
    }
  })

  return {
    batchItemFailures: results
      .map((result, index) => ({
        result,
        itemIdentifier: jobs[index]!.id || `message-${index}`,
      }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ itemIdentifier }) => ({ itemIdentifier })),
  }
}
