import {
  PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  QueueWebhookService,
  type SendWebhookInput,
  type SendWebhookResult,
  type WebhookAttemptResult,
  type WebhookDeliveryRecord,
  type WebhookDeliveryWithAttempts,
} from '@pikku/core/services'
import type { QueueService } from '@pikku/core/queue'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { ensurePikkuSchema } from './schema/index.js'
import { webhookSchema } from './schema/webhook.schema.js'

/**
 * Durable {@link QueueWebhookService}: still delivers through the
 * `pikku-outgoing-webhooks` queue, but records a `webhook_delivery` row per
 * `send()` and one `webhook_delivery_attempt` row per try. Register it as the
 * `webhookService` singleton; the queue worker persists each attempt through
 * {@link recordAttempt}, overriding the base's throwing default.
 */
export class KyselyWebhookService extends QueueWebhookService {
  private initialized = false

  constructor(
    queueService: QueueService,
    private db: Kysely<KyselyPikkuDB>
  ) {
    super(queueService)
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, webhookSchema)
    this.initialized = true
  }

  public async send(input: SendWebhookInput): Promise<SendWebhookResult> {
    const deliveryId = globalThis.crypto.randomUUID()
    const { jobData, options } = await this.prepareDelivery(input)

    await this.db
      .insertInto('webhookDelivery')
      .values({
        deliveryId,
        organizationId: input.organizationId ?? null,
        url: input.url,
        event: input.event ?? null,
      })
      .execute()

    // deliveryId doubles as the queue jobId (idempotency) and rides in the
    // payload so the worker can record attempts against this row.
    const jobId = await this.queueService.add(
      PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
      { ...jobData, deliveryId },
      { ...options, jobId: deliveryId }
    )
    return { jobId }
  }

  public async recordAttempt(
    deliveryId: string,
    { statusCode, responseBody, error, delivered }: WebhookAttemptResult
  ): Promise<void> {
    const now = new Date()
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('webhookDeliveryAttempt')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('deliveryId', '=', deliveryId)
        .executeTakeFirst()
      const attemptNumber = Number(existing?.count ?? 0) + 1

      await trx
        .insertInto('webhookDeliveryAttempt')
        .values({
          attemptId: globalThis.crypto.randomUUID(),
          deliveryId,
          attemptNumber,
          statusCode: statusCode ?? null,
          responseBody: responseBody ?? null,
          error: error ?? null,
        })
        .execute()

      await trx
        .updateTable('webhookDelivery')
        .set({
          status: delivered ? 'delivered' : 'failed',
          attempts: attemptNumber,
          updatedAt: now,
          ...(delivered ? { deliveredAt: now } : {}),
        })
        .where('deliveryId', '=', deliveryId)
        .execute()
    })
  }

  /** List deliveries, most recent first — for the console webhooks view. */
  public async listDeliveries(opts?: {
    organizationId?: string
    limit?: number
  }): Promise<WebhookDeliveryRecord[]> {
    let query = this.db
      .selectFrom('webhookDelivery')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 100)
    if (opts?.organizationId) {
      query = query.where('organizationId', '=', opts.organizationId)
    }
    return query.execute()
  }

  /** A single delivery with its full attempt history, or null if unknown. */
  public async getDelivery(
    deliveryId: string
  ): Promise<WebhookDeliveryWithAttempts | null> {
    const delivery = await this.db
      .selectFrom('webhookDelivery')
      .selectAll()
      .where('deliveryId', '=', deliveryId)
      .executeTakeFirst()
    if (!delivery) {
      return null
    }
    const attempts = await this.db
      .selectFrom('webhookDeliveryAttempt')
      .selectAll()
      .where('deliveryId', '=', deliveryId)
      .orderBy('attemptNumber', 'asc')
      .execute()
    return { delivery, attempts }
  }
}
