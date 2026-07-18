import {
  PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  QueueWebhookService,
  type SendWebhookInput,
  type SendWebhookResult,
  type WebhookAttemptResult,
  type WebhookDeliveryRecord,
  type WebhookDeliveryStore,
  type WebhookDeliveryWithAttempts,
} from '@pikku/core/services'
import type { QueueService } from '@pikku/core/queue'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

/**
 * Durable {@link QueueWebhookService}: still delivers through the
 * `pikku-outgoing-webhooks` queue, but records a `webhook_delivery` row per
 * `send()` and one `webhook_delivery_attempt` row per try. Register the same
 * instance as both `webhookService` and `webhookDeliveryStore` so the queue
 * worker persists each attempt through {@link recordAttempt}.
 */
export class KyselyWebhookService
  extends QueueWebhookService
  implements WebhookDeliveryStore
{
  private initialized = false

  constructor(
    queueService: QueueService,
    private db: Kysely<KyselyPikkuDB>
  ) {
    super(queueService)
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('webhook_delivery')
      .ifNotExists()
      .addColumn('delivery_id', 'text', (col) => col.primaryKey())
      .addColumn('organization_id', 'text')
      .addColumn('url', 'text', (col) => col.notNull())
      .addColumn('event', 'text')
      .addColumn('status', 'text', (col) => col.defaultTo('pending').notNull())
      .addColumn('attempts', 'integer', (col) => col.defaultTo(0).notNull())
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('delivered_at', 'timestamp')
      .execute()

    await this.db.schema
      .createTable('webhook_delivery_attempt')
      .ifNotExists()
      .addColumn('attempt_id', 'text', (col) => col.primaryKey())
      .addColumn('delivery_id', 'text', (col) =>
        col.notNull().references('webhook_delivery.delivery_id').onDelete('cascade')
      )
      .addColumn('attempt_number', 'integer', (col) => col.notNull())
      .addColumn('status_code', 'integer')
      .addColumn('response_body', 'text')
      .addColumn('error', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_webhook_delivery_org')
        .ifNotExists()
        .on('webhook_delivery')
        .column('organization_id')
    )
    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_webhook_delivery_attempt_delivery')
        .ifNotExists()
        .on('webhook_delivery_attempt')
        .column('delivery_id')
    )

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

  private async createIndexSafe(builder: {
    execute(): Promise<void>
  }): Promise<void> {
    try {
      await builder.execute()
    } catch (e: any) {
      if (e?.code === 'ER_DUP_KEYNAME' || e?.errno === 1061) return
      if (e?.code === '42P07') return
      if (e?.message?.includes('already exists')) return
      throw e
    }
  }
}
