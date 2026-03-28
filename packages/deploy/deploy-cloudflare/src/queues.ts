import type { CloudflareClient } from './client.js'
import type {
  QueueConsumer,
  QueueConsumerSettings,
  QueueMetadata,
} from './types.js'

/**
 * Create a new Cloudflare Queue.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Queue name (must be unique within the account).
 * @returns Queue metadata from the API.
 */
export async function createQueue(
  client: CloudflareClient,
  name: string
): Promise<QueueMetadata> {
  return client.request<QueueMetadata>('POST', '/queues', {
    queue_name: name,
  })
}

/**
 * Delete an existing Cloudflare Queue.
 *
 * @param client  - Authenticated CloudflareClient instance.
 * @param queueId - The queue ID to delete.
 */
export async function deleteQueue(
  client: CloudflareClient,
  queueId: string
): Promise<void> {
  await client.request<void>('DELETE', `/queues/${encodeURIComponent(queueId)}`)
}

/**
 * List all Queues in the account.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @returns Array of Queue metadata objects.
 */
export async function listQueues(
  client: CloudflareClient
): Promise<QueueMetadata[]> {
  return client.request<QueueMetadata[]>('GET', '/queues')
}

/**
 * Bind a Worker as a consumer to a Queue.
 *
 * This configures the Worker to receive messages from the specified Queue.
 * The Worker must already have a `queue` event handler exported.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param queueId    - The queue ID to bind the consumer to.
 * @param workerName - The Worker script name that will consume messages.
 * @param settings   - Optional consumer settings (batch size, retries, etc.).
 * @returns Consumer metadata from the API.
 */
export async function createConsumer(
  client: CloudflareClient,
  queueId: string,
  workerName: string,
  settings: QueueConsumerSettings = {}
): Promise<QueueConsumer> {
  return client.request<QueueConsumer>(
    'POST',
    `/queues/${encodeURIComponent(queueId)}/consumers`,
    {
      script_name: workerName,
      settings: {
        batch_size: settings.batch_size ?? 10,
        max_retries: settings.max_retries ?? 3,
        max_wait_time_ms: settings.max_wait_time_ms ?? 5000,
        max_concurrency: settings.max_concurrency,
      },
    }
  )
}

/**
 * Remove a consumer binding from a Queue.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param queueId    - The queue ID.
 * @param consumerId - The consumer ID to remove.
 */
export async function deleteConsumer(
  client: CloudflareClient,
  queueId: string,
  consumerId: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/queues/${encodeURIComponent(queueId)}/consumers/${encodeURIComponent(consumerId)}`
  )
}
