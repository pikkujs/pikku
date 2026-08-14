import type { WebhookDeliveryWithAttempts } from '@pikku/core/ecosystem/services'
import { pikkuFunc } from '#pikku'

export const getWebhookDelivery = pikkuFunc<
  { deliveryId: string },
  WebhookDeliveryWithAttempts | null
>({
  title: 'Get Webhook Delivery',
  description:
    'Returns a single webhook delivery with its full attempt history.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ webhookService }, { deliveryId }) => {
    return webhookService.getDelivery(deliveryId)
  },
})
