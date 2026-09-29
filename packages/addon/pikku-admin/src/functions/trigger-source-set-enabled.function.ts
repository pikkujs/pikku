import { pikkuFunc } from '#pikku/addon/function'
import {
  setWebhookSourceEnabled,
  type WebhookSourceOutcome,
} from '@pikku/core/trigger'

export const triggerSourceSetEnabled = pikkuFunc<
  { name: string; enabled: boolean; baseUrl: string; labelPrefix: string },
  WebhookSourceOutcome
>({
  title: 'Enable or Disable a Trigger Source',
  description:
    "Registers the source's endpoint with its provider, or removes it. A failed step leaves the source as it was and reports why.",
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async (
    _services,
    { name, enabled, baseUrl, labelPrefix },
    { session }
  ) =>
    setWebhookSourceEnabled({
      name,
      enabled,
      baseUrl,
      labelPrefix,
      actor: session?.userId,
    }),
})
