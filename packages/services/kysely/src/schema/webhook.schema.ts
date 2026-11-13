import type { PikkuSchema } from './pikku-schema.types.js'

/** Webhook deliveries and one row per delivery attempt. */
export const webhookSchema: PikkuSchema = {
  name: 'webhook',
  ownedBy: ['webhookService'],
  tables: {
    webhookDelivery: {
      columns: {
        deliveryId: { type: 'key', primaryKey: true },
        organizationId: { type: 'key' },
        url: { type: 'text', required: true },
        event: { type: 'text' },
        status: { type: 'text', required: true, default: 'pending' },
        attempts: { type: 'integer', required: true, default: 0 },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        deliveredAt: { type: 'timestamp' },
      },
      indexes: [
        { name: 'idx_webhook_delivery_org', columns: ['organizationId'] },
      ],
    },
    webhookDeliveryAttempt: {
      columns: {
        attemptId: { type: 'key', primaryKey: true },
        deliveryId: {
          type: 'key',
          required: true,
          references: 'webhookDelivery.deliveryId',
          onDelete: 'cascade',
        },
        attemptNumber: { type: 'integer', required: true },
        statusCode: { type: 'integer' },
        responseBody: { type: 'text' },
        error: { type: 'text' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        {
          name: 'idx_webhook_delivery_attempt_delivery',
          columns: ['deliveryId'],
        },
      ],
    },
  },
}
