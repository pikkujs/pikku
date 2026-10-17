import type { IncomingWebhookReceiptRecord } from '@pikku/core/services'
import { pikkuFunc } from '#pikku/addon/function'

/**
 * Incoming webhook receipts, newest first.
 *
 * Empty rather than an error when no `incomingWebhookService` is wired, for the
 * same reason `listWebhookDeliveries` is: webhook sources are opt-in, and the
 * console lists the page on every project.
 */
export const listIncomingWebhookReceipts = pikkuFunc<
  { source?: string; limit?: number },
  IncomingWebhookReceiptRecord[]
>({
  title: 'List Incoming Webhook Receipts',
  description:
    'Lists received webhook events (most recent first), optionally for one source. Empty when the app wires no incoming webhook service or keeps no receipts.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ incomingWebhookService }, input) => {
    if (!incomingWebhookService) {
      return []
    }
    return incomingWebhookService.listReceipts(input ?? undefined)
  },
})
