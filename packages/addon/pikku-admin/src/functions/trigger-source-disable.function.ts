import { pikkuFunc } from '#pikku/addon/function'
import {
  disableTriggerSource,
  type WebhookSourceOutcome,
} from '@pikku/core/trigger'

export const triggerSourceDisable = pikkuFunc<
  { name: string; baseUrl?: string; labelPrefix?: string },
  { outcome: WebhookSourceOutcome }
>({
  title: 'Turn Off a Trigger Source',
  description:
    'Stops a trigger source receiving at once, then removes it from its provider.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async (_services, input) => ({
    outcome: await disableTriggerSource(input),
  }),
})
