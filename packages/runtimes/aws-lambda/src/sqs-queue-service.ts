/**
 * SQS implementation of QueueService (producer side).
 *
 * Sends messages to SQS queues. Queue URLs are resolved from environment
 * variables following the convention: SQS_QUEUE_URL_<SCREAMING_SNAKE_NAME>.
 *
 * The consumer side is handled by sqs-worker.ts (runSQSQueueWorker).
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'

export class SQSQueueService implements QueueService {
  readonly supportsResults = false
  private client: SQSClient

  constructor(private queueUrlMap?: Record<string, string>) {
    this.client = new SQSClient({})
  }

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const queueUrl = this.resolveQueueUrl(queueName)
    const messageId = crypto.randomUUID()

    const message = {
      id: messageId,
      queueName,
      data,
      pikkuUserId: options?.pikkuUserId,
    }

    const result = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: options?.delay
          ? Math.min(Math.ceil(options.delay / 1000), 900)
          : undefined,
      })
    )

    return result.MessageId ?? messageId
  }

  async getJob<T, R>(
    _queueName: string,
    _jobId: string
  ): Promise<QueueJob<T, R> | null> {
    throw new Error(
      'SQSQueueService does not support getJob(). ' +
        'SQS is fire-and-forget. ' +
        'Use BullMQ or PgBoss if you need job result tracking.'
    )
  }

  /**
   * Resolves the SQS queue URL for a given queue name.
   *
   * Checks in order:
   * 1. Explicit queueUrlMap passed in constructor
   * 2. Environment variable SQS_QUEUE_URL_<SCREAMING_SNAKE>
   */
  private resolveQueueUrl(queueName: string): string {
    if (this.queueUrlMap?.[queueName]) {
      return this.queueUrlMap[queueName]
    }

    const envKey = `SQS_QUEUE_URL_${toScreamingSnake(queueName)}`
    const url = process.env[envKey]

    if (!url) {
      throw new Error(
        `SQS queue URL not found for queue "${queueName}". ` +
          `Set environment variable ${envKey} or pass queueUrlMap to constructor.`
      )
    }

    return url
  }
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
