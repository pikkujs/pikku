import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'

/**
 * Configuration for SQS Queue Service
 */
export interface SQSQueueServiceConfig {
  /** AWS region for SQS client */
  region: string
  /** Queue URL prefix (e.g., 'https://sqs.us-east-1.amazonaws.com/123456789/') */
  queueUrlPrefix: string
  /** Optional endpoint for LocalStack or custom SQS endpoint */
  endpoint?: string
}

/**
 * SQS Queue Service implementation
 * Provides fire-and-forget job publishing to AWS SQS queues
 *
 * Limitations:
 * - Does not support job result retrieval (supportsResults = false)
 * - Does not support job status queries after submission
 * - Only supports standard queues (no FIFO)
 * - Delay is limited to 900 seconds (15 minutes) per SQS constraints
 */
export class SQSQueueService implements QueueService {
  readonly supportsResults = false
  private readonly client: SQSClient
  private readonly queueUrls = new Map<string, string>()

  constructor(private readonly config: SQSQueueServiceConfig) {
    this.client = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
    })
  }

  /**
   * Get or construct the queue URL for a given queue name
   * Uses prefix-based construction and caches the result
   */
  private getQueueUrl(queueName: string): string {
    if (this.queueUrls.has(queueName)) {
      return this.queueUrls.get(queueName)!
    }

    const queueUrl = `${this.config.queueUrlPrefix}${queueName}`
    this.queueUrls.set(queueName, queueUrl)
    return queueUrl
  }

  /**
   * Add a job to the SQS queue
   * @param queueName - Name of the queue to send to
   * @param data - Job data (will be JSON stringified)
   * @param options - Optional job configuration
   * @returns Message ID from SQS
   */
  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const queueUrl = this.getQueueUrl(queueName)

    // Convert delay from milliseconds to seconds (SQS constraint)
    // SQS max delay is 900 seconds (15 minutes)
    let delaySeconds: number | undefined
    if (options?.delay !== undefined) {
      delaySeconds = Math.floor(options.delay / 1000)
      if (delaySeconds > 900) {
        throw new Error(
          `SQS delay cannot exceed 900 seconds (15 minutes). Requested: ${delaySeconds}s`
        )
      }
      if (delaySeconds < 0) {
        throw new Error(
          `SQS delay cannot be negative. Requested: ${delaySeconds}s`
        )
      }
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(data),
      DelaySeconds: delaySeconds,
    })

    const response = await this.client.send(command)

    if (!response.MessageId) {
      throw new Error(`Failed to send message to queue '${queueName}'`)
    }

    return response.MessageId
  }

  /**
   * Get job status and result (NOT SUPPORTED for SQS)
   * SQS is a fire-and-forget messaging service and does not support
   * querying message status after it has been sent
   *
   * @throws Error indicating this operation is not supported
   */
  async getJob<T, R>(
    queueName: string,
    jobId: string
  ): Promise<QueueJob<T, R> | null> {
    throw new Error(
      'SQSQueueService does not support getJob(). SQS is a fire-and-forget messaging service. ' +
        'Use BullMQ or PgBoss if you need job result tracking.'
    )
  }
}
