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
  func: async ({ webhookService }, input) => {
    return webhookService.listDeliveries(input ?? undefined)
  },
})
