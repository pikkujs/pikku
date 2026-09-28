import type { QueueService } from '../wirings/queue/queue.types.js'
import { DEFAULT_WEBHOOK_RETRIES } from './webhook-service.js'
import {
  PIKKU_INCOMING_WEBHOOK_QUEUE_NAME,
  type TriggerEvent,
  type WebhookRequest,
  type WebhookSourceJob,
} from '../wirings/trigger/webhook-source.types.js'

export type IncomingWebhookAttempt = {
  trigger: string
  error?: string
}

export type IncomingWebhookReceiptRecord = {
  receiptId: string
  source: string
  providerEventId: string | null
  event: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  lastError: string | null
  createdAt: Date
  deliveredAt: Date | null
}

/**
 * Queues each event a webhook source received for the
 * `pikku-incoming-webhooks` worker, so the provider is answered once the event
 * is safe and our own processing is retried by the queue, not by the provider.
 *
 * The queue is a constructor argument, as in `QueueWebhookService`: a webhook
 * source wired without one fails to compile rather than on its first delivery.
 */
export class IncomingWebhookService {
  constructor(
    protected queueService: QueueService,
    /** How often a failing trigger is retried before the event is given up on. */
    protected retries: number = DEFAULT_WEBHOOK_RETRIES
  ) {}

  /** Returns how many events were queued. A store-backed service drops ones it has already seen. */
  public async accept({
    source,
    events,
  }: {
    source: string
    request: WebhookRequest
    events: TriggerEvent[]
  }): Promise<number> {
    for (const event of events) {
      await this.enqueue({ source, event })
    }
    return events.length
  }

  /** The job id is the provider's event id, which de-duplicates on queues that honour job ids. */
  protected async enqueue(job: WebhookSourceJob): Promise<string> {
    const jobId =
      job.receiptId ??
      (job.event.id ? `${job.source}:${job.event.id}` : undefined)
    // knowledge: decisions/internals/queue-jobs-always-carry-an-explicit-attempts-count.md
    return this.queueService.add(PIKKU_INCOMING_WEBHOOK_QUEUE_NAME, job, {
      attempts: this.retries + 1,
      ...(this.retries > 0 ? { backoff: 'exponential' as const } : {}),
      ...(jobId ? { jobId } : {}),
    })
  }

  /** Keeps nothing by default; a store-backed service records each dispatch. */
  public async recordAttempt(
    _receiptId: string,
    _attempt: IncomingWebhookAttempt
  ): Promise<void> {}

  /** Most recent first. Empty when nothing is stored. */
  public async listReceipts(_opts?: {
    source?: string
    limit?: number
  }): Promise<IncomingWebhookReceiptRecord[]> {
    return []
  }
}
