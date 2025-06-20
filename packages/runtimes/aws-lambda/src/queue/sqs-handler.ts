import { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'
import { runQueueJob } from '@pikku/core/queue'
import type {
  CoreSingletonServices,
  CreateSessionServices,
  QueueJob,
} from '@pikku/core'

/**
 * Convert SQS record to Pikku queue job format
 */
export function mapSQSRecordToQueueJob(record: SQSRecord): QueueJob {
  let data: any

  try {
    // Try to parse as JSON first
    data = JSON.parse(record.body)
  } catch {
    // Fall back to raw string if not valid JSON
    data = record.body
  }

  // Extract queue name from source ARN or use default
  // SQS ARN format: arn:aws:sqs:region:account:queue-name
  if (!record.eventSourceARN) {
    throw new Error('SQS record does not have eventSourceARN')
  }
  const queueName = record.eventSourceARN.split(':').pop()!

  const job: QueueJob = {
    queueName,
    data,
    status: () => 'active',
    id: record.messageId,
    createdAt: new Date(parseInt(record.attributes.SentTimestamp)),
    processedAt: new Date(),
    attemptsMade: parseInt(record.attributes.ApproximateReceiveCount) - 1,
    maxAttempts: undefined, // SQS doesn't expose max attempts directly
  }

  return job
}

/**
 * Process all SQS records from an SQS event
 */
export function mapSQSEventToQueueJobs(event: SQSEvent): QueueJob[] {
  return event.Records.map(mapSQSRecordToQueueJob)
}

/**
 * Create an SQS handler that processes queue jobs using Pikku
 */
export const runSQSQueueMessage = async (
  singletonServices: CoreSingletonServices,
  createSessionServices: CreateSessionServices<any, any, any> | undefined,
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  const jobs = mapSQSEventToQueueJobs(event)

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
