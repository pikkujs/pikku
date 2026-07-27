import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Webhook deliveries and one row per delivery attempt. */
export const webhookSchema: PikkuSchema = {
  name: 'webhook',
  statements: [
    (db) =>
      db.schema
        .createTable('webhookDelivery')
        .addColumn('deliveryId', 'text', (col) => col.primaryKey())
        .addColumn('organizationId', 'text')
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('event', 'text')
        .addColumn('status', 'text', (col) =>
          col.defaultTo('pending').notNull()
        )
        .addColumn('attempts', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('deliveredAt', 'timestamp'),

    (db) =>
      db.schema
        .createTable('webhookDeliveryAttempt')
        .addColumn('attemptId', 'text', (col) => col.primaryKey())
        .addColumn('deliveryId', 'text', (col) =>
          col
            .notNull()
            .references('webhookDelivery.deliveryId')
            .onDelete('cascade')
        )
        .addColumn('attemptNumber', 'integer', (col) => col.notNull())
        .addColumn('statusCode', 'integer')
        .addColumn('responseBody', 'text')
        .addColumn('error', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_webhook_delivery_org')
        .on('webhookDelivery')
        .column('organizationId'),

    (db) =>
      db.schema
        .createIndex('idx_webhook_delivery_attempt_delivery')
        .on('webhookDeliveryAttempt')
        .column('deliveryId'),
  ],
}
