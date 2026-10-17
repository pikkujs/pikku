import type { IncomingWebhookReceiptRecord } from '@pikku/core/services'
import { pikkuFunc } from '#pikku/addon/function'

export const getIncomingWebhookReceipt = pikkuFunc<
  { receiptId: string },
  IncomingWebhookReceiptRecord | null
>({
  title: 'Get Incoming Webhook Receipt',
  description:
    'Returns a single received webhook event, or null when the app wires no incoming webhook service or keeps no receipt with this id.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ incomingWebhookService }, { receiptId }) => {
    if (!incomingWebhookService) {
      return null
    }
    return incomingWebhookService.getReceipt(receiptId)
  },
})
