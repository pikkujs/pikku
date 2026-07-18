import { MissingServiceError } from '@pikku/core/errors'
import type { WebhookDeliveryWithAttempts } from '@pikku/core/services'
import { pikkuFunc } from '#pikku'

export const getWebhookDelivery = pikkuFunc<
  { deliveryId: string },
  WebhookDeliveryWithAttempts | null
>({
  title: 'Get Webhook Delivery',
  description: 'Returns a single webhook delivery with its full attempt history.',
  expose: true,
  func: async ({ webhookDeliveryStore }, { deliveryId }) => {
    if (!webhookDeliveryStore) {
      throw new MissingServiceError('WebhookDeliveryStore is not configured')
    }
    return webhookDeliveryStore.getDelivery(deliveryId)
  },
})
