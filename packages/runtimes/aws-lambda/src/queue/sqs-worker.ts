import { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import {
  runQueueJob,
  QueueJobFailedError,
  QueueJobDiscardedError,
} from '@pikku/core/queue'
import type {
  CoreSingletonServices,
  CreateInteractionServices,
} from '@pikku/core'
import type { QueueJob, QueueJobStatus } from '@pikku/core/queue'

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
  createInteractionServices:
    | CreateInteractionServices<any, any, any>
    | undefined,
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  console.log(JSON.stringify(event, null, 2))
  const jobs = event.Records.map(mapSQSRecordToQueueJob)

  // Process all jobs in parallel
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        return await runQueueJob({
          singletonServices,
          createInteractionServices,
          job,
        })
      } catch (error: unknown) {
        if (error instanceof QueueJobFailedError) {
          // Let SQS handle this as a failed job (will go to retry or DLQ)
          throw error
        } else if (error instanceof QueueJobDiscardedError) {
          // For SQS, discarding means completing successfully (no retry)
          singletonServices.logger.info(
            `SQS job ${job.id} discarded: ${error.message}`
          )
          return // Successfully "completed" by discarding
        }
        throw error
      }
    })
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
