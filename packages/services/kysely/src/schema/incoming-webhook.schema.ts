import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** One row per event a webhook source accepted, keyed for provider de-duplication. */
export const incomingWebhookSchema: PikkuSchema = {
  name: 'incoming-webhook',
  ownedBy: ['incomingWebhookService'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('webhookReceipt')
        .addColumn('receiptId', ctx.key, (col) => col.primaryKey())
        .addColumn('source', ctx.key, (col) => col.notNull())
        .addColumn('event', ctx.key, (col) => col.notNull())
        .addColumn('providerEventId', ctx.key)
        .addColumn('status', ctx.text, (col) =>
          col.defaultTo(ctx.defaultText('pending')).notNull()
        )
        .addColumn('attempts', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('lastError', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('deliveredAt', 'timestamp'),

    (db) =>
      db.schema
        .createIndex('idx_webhook_receipt_provider_event')
        .unique()
        .on('webhookReceipt')
        .columns(['source', 'event', 'providerEventId']),

    (db) =>
      db.schema
        .createIndex('idx_webhook_receipt_source_created')
        .on('webhookReceipt')
        .columns(['source', 'createdAt']),
  ],
}
