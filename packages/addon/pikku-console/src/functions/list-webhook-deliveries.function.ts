import type { WebhookDeliveryRecord } from '@pikku/core/services'
import { pikkuFunc } from '#pikku/addon/function'

/**
 * Outgoing webhook deliveries, newest first.
 *
 * Empty rather than an error when no `webhookService` is wired: outgoing
 * webhooks are opt-in (`pikku enable webhook`), and most apps never turn them
 * on. The console lists every page unconditionally, so without this the
 * webhooks page is a crash on the majority of projects rather than an empty
 * state — the same reason `listScenarioRuns` and `getVirtualUserRuns` return
 * empty for a store their host never wired.
 */
export const listWebhookDeliveries = pikkuFunc<
  { organizationId?: string; limit?: number },
  WebhookDeliveryRecord[]
>({
  title: 'List Webhook Deliveries',
  description:
    'Lists outgoing webhook deliveries (most recent first), optionally scoped to an organization. Empty when the app wires no webhook service.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ webhookService }, input) => {
    if (!webhookService) {
      return []
    }
    return webhookService.listDeliveries(input ?? undefined)
  },
})
