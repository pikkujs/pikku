import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'

/**
 * Cloudflare Queues implementation of QueueService.
 *
 * Uses CF Queue producer bindings from the worker's env to send messages.
 * Fire-and-forget — does not support job result retrieval.
 *
 * Queue bindings are passed as env entries (e.g. env.TODO_REMINDERS).
 * The binding name is derived from the queue name by converting to
 * SCREAMING_SNAKE_CASE.
 */
export class CloudflareQueueService implements QueueService {
  readonly supportsResults = false

  constructor(private env: Record<string, unknown>) {}

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const bindingName = toScreamingSnake(queueName)
    const queue = this.env[bindingName] as
      | { send: (message: unknown) => Promise<void> }
      | undefined

    if (!queue) {
      throw new Error(
        `Queue binding "${bindingName}" not found in env for queue "${queueName}". ` +
          `Check your wrangler.toml [[queues.producers]] configuration.`
      )
    }

    const messageId = crypto.randomUUID()
    const message = {
      id: messageId,
      queueName,
      data,
      pikkuUserId: options?.pikkuUserId,
      delay: options?.delay,
    }

    await queue.send(message)
    return messageId
  }

  async getJob<T, R>(
    _queueName: string,
    _jobId: string
  ): Promise<QueueJob<T, R> | null> {
    throw new Error(
      'CloudflareQueueService does not support getJob(). ' +
        'Cloudflare Queues is fire-and-forget. ' +
        'Use BullMQ or PgBoss if you need job result tracking.'
    )
  }
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
