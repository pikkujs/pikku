import type { WebhookDeliveryRecord } from '@pikku/core/ecosystem/services'
import { pikkuFunc } from '#pikku/function'

export const listWebhookDeliveries = pikkuFunc<
  { organizationId?: string; limit?: number },
  WebhookDeliveryRecord[]
>({
  title: 'List Webhook Deliveries',
  description:
    'Lists outgoing webhook deliveries (most recent first), optionally scoped to an organization.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ webhookService }, input) => {
    return webhookService.listDeliveries(input ?? undefined)
  },
})
