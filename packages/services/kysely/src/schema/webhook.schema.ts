import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Webhook deliveries and one row per delivery attempt. */
export const webhookSchema: PikkuSchema = {
  name: 'webhook',
  ownedBy: ['webhookService'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('webhookDelivery')
        .addColumn('deliveryId', ctx.key, (col) => col.primaryKey())
        .addColumn('organizationId', ctx.key)
        .addColumn('url', ctx.text, (col) => col.notNull())
        .addColumn('event', ctx.text)
        .addColumn('status', ctx.text, (col) =>
          col.defaultTo(ctx.defaultText('pending')).notNull()
        )
        .addColumn('attempts', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('deliveredAt', 'timestamp'),

    (db, _types, ctx) =>
      db.schema
        .createTable('webhookDeliveryAttempt')
        .addColumn('attemptId', ctx.key, (col) => col.primaryKey())
        .addColumn('deliveryId', ctx.key, (col) =>
          ctx.references(col.notNull(), 'webhookDelivery.deliveryId')
        )
        .addColumn('attemptNumber', 'integer', (col) => col.notNull())
        .addColumn('statusCode', 'integer')
        .addColumn('responseBody', ctx.text)
        .addColumn('error', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .$call(
          ctx.foreignKeys('webhookDeliveryAttempt', {
            deliveryId: 'webhookDelivery.deliveryId',
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_webhook_delivery_org')
        .on('webhookDelivery')
        .column('organizationId'),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_webhook_delivery_attempt_delivery')
        .on('webhookDeliveryAttempt')
        .column('deliveryId'),
  ],
}
