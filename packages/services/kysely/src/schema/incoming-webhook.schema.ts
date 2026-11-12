import type { PikkuSchema } from './pikku-schema.types.js'

/** One row per event a webhook source accepted, keyed for provider de-duplication. */
export const incomingWebhookSchema: PikkuSchema = {
  name: 'incoming-webhook',
  ownedBy: ['incomingWebhookService'],
  tables: {
    webhookReceipt: {
      columns: {
        receiptId: { type: 'key', primaryKey: true },
        source: { type: 'key', required: true },
        event: { type: 'key', required: true },
        providerEventId: { type: 'key' },
        status: { type: 'text', required: true, default: 'pending' },
        attempts: { type: 'integer', required: true, default: 0 },
        lastError: { type: 'text' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        deliveredAt: { type: 'timestamp' },
      },
      indexes: [
        {
          name: 'idx_webhook_receipt_provider_event',
          columns: ['source', 'event', 'providerEventId'],
          unique: true,
        },
        {
          name: 'idx_webhook_receipt_source_created',
          columns: ['source', 'createdAt'],
        },
      ],
    },
  },
}
