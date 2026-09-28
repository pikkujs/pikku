import {
  IncomingWebhookService,
  type IncomingWebhookAttempt,
  type IncomingWebhookReceiptRecord,
} from '@pikku/core/services'
import type { QueueService } from '@pikku/core/queue'
import type { TriggerEvent, WebhookRequest } from '@pikku/core/trigger'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { incomingWebhookSchema } from './schema/incoming-webhook.schema.js'

/**
 * Durable {@link IncomingWebhookService}: records a `webhook_receipt` row per
 * accepted event before queueing it, so a provider's redelivery of an event id
 * it has already sent is dropped, and each trigger attempt rolls the receipt's
 * status forward.
 */
export class KyselyIncomingWebhookService extends IncomingWebhookService {
  private initialized = false

  constructor(
    queueService: QueueService,
    private db: Kysely<KyselyPikkuDB>,
    retries?: number
  ) {
    super(queueService, retries)
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, incomingWebhookSchema)
    this.initialized = true
  }

  public async accept({
    source,
    events,
  }: {
    source: string
    request: WebhookRequest
    events: TriggerEvent[]
  }): Promise<number> {
    let accepted = 0
    for (const event of events) {
      const receiptId = await this.record(source, event)
      if (!receiptId) continue
      try {
        await this.enqueue({ source, event, receiptId })
      } catch (error) {
        // Without the receipt the provider's retry is accepted again rather
        // than dropped as a duplicate of an event that was never queued.
        await this.db
          .deleteFrom('webhookReceipt')
          .where('receiptId', '=', receiptId)
          .execute()
        throw error
      }
      accepted++
    }
    return accepted
  }

  /** The new receipt's id, or undefined when this provider event id was already received. */
  private async record(
    source: string,
    event: TriggerEvent
  ): Promise<string | undefined> {
    const receiptId = globalThis.crypto.randomUUID()
    const providerEventId = event.id ?? null
    try {
      await this.db
        .insertInto('webhookReceipt')
        .values({ receiptId, source, event: event.name, providerEventId })
        .execute()
      return receiptId
    } catch (error) {
      if (providerEventId === null) throw error
      const existing = await this.db
        .selectFrom('webhookReceipt')
        .select('receiptId')
        .where('source', '=', source)
        .where('event', '=', event.name)
        .where('providerEventId', '=', providerEventId)
        .executeTakeFirst()
      if (existing) return undefined
      throw error
    }
  }

  public async recordAttempt(
    receiptId: string,
    { error }: IncomingWebhookAttempt
  ): Promise<void> {
    await this.db
      .updateTable('webhookReceipt')
      .set((eb) => ({
        attempts: eb('attempts', '+', 1),
        status: error ? 'failed' : 'delivered',
        lastError: error ?? null,
        ...(error ? {} : { deliveredAt: new Date() }),
      }))
      .where('receiptId', '=', receiptId)
      .execute()
  }

  public async listReceipts(opts?: {
    source?: string
    limit?: number
  }): Promise<IncomingWebhookReceiptRecord[]> {
    let query = this.db
      .selectFrom('webhookReceipt')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 100)
    if (opts?.source) {
      query = query.where('source', '=', opts.source)
    }
    return query.execute()
  }
}
