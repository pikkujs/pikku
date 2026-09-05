import type { WebhookDeliveryWithAttempts } from '@pikku/core/services'
import { pikkuFunc } from '#pikku/addon/function'

export const getWebhookDelivery = pikkuFunc<
  { deliveryId: string },
  WebhookDeliveryWithAttempts | null
>({
  title: 'Get Webhook Delivery',
  description:
    'Returns a single webhook delivery with its full attempt history, or null when the app wires no webhook service.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ webhookService }, { deliveryId }) => {
    if (!webhookService) {
      return null
    }
    return webhookService.getDelivery(deliveryId)
  },
})
