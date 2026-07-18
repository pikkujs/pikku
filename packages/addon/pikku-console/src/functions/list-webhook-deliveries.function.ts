import { MissingServiceError } from '@pikku/core/errors'
import type { WebhookDeliveryRecord } from '@pikku/core/services'
import { pikkuFunc } from '#pikku'

export const listWebhookDeliveries = pikkuFunc<
  { organizationId?: string; limit?: number },
  WebhookDeliveryRecord[]
>({
  title: 'List Webhook Deliveries',
  description:
    'Lists outgoing webhook deliveries (most recent first), optionally scoped to an organization.',
  expose: true,
  func: async ({ webhookDeliveryStore }, input) => {
    if (!webhookDeliveryStore) {
      throw new MissingServiceError('WebhookDeliveryStore is not configured')
    }
    return webhookDeliveryStore.listDeliveries(input ?? undefined)
  },
})
