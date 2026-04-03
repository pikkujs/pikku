/**
 * Azure Storage Queue implementation of QueueService (producer side).
 *
 * Sends messages to Azure Storage Queues. Queue URLs are resolved from
 * environment variables following the convention:
 * AZURE_QUEUE_NAME_<SCREAMING_SNAKE> (queue name) with the connection
 * string from AzureWebJobsStorage.
 */

import { QueueClient, QueueServiceClient } from '@azure/storage-queue'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'

export class AzureQueueService implements QueueService {
  readonly supportsResults = false
  private queueServiceClient: QueueServiceClient
  private queueClients = new Map<string, QueueClient>()

  constructor(connectionString?: string) {
    const connStr = connectionString ?? process.env.AzureWebJobsStorage ?? ''
    this.queueServiceClient = QueueServiceClient.fromConnectionString(connStr)
  }

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const client = this.getQueueClient(queueName)
    const messageId = crypto.randomUUID()

    const message = {
      id: messageId,
      queueName,
      data,
      pikkuUserId: options?.pikkuUserId,
    }

    // Azure Storage Queue messages must be base64-encoded strings
    const encoded = Buffer.from(JSON.stringify(message)).toString('base64')

    const visibilityTimeout = options?.delay
      ? Math.min(Math.ceil(options.delay / 1000), 604800) // max 7 days
      : undefined

    await client.sendMessage(encoded, { visibilityTimeout })
    return messageId
  }

  async getJob<T, R>(
    _queueName: string,
    _jobId: string
  ): Promise<QueueJob<T, R> | null> {
    throw new Error(
      'AzureQueueService does not support getJob(). ' +
        'Azure Storage Queues are fire-and-forget. ' +
        'Use BullMQ or PgBoss if you need job result tracking.'
    )
  }

  private getQueueClient(queueName: string): QueueClient {
    if (!this.queueClients.has(queueName)) {
      const resolvedName = this.resolveQueueName(queueName)
      const client = this.queueServiceClient.getQueueClient(resolvedName)
      this.queueClients.set(queueName, client)
    }
    return this.queueClients.get(queueName)!
  }

  /**
   * Resolves the Azure queue name. Checks env var
   * AZURE_QUEUE_NAME_<SCREAMING_SNAKE> first, falls back to the name as-is.
   */
  private resolveQueueName(queueName: string): string {
    const envKey = `AZURE_QUEUE_NAME_${toScreamingSnake(queueName)}`
    return process.env[envKey] ?? queueName
  }
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
