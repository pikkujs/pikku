import { pikkuFunc } from '#pikku/addon/function'
import {
  enableTriggerSource,
  type WebhookSourceOutcome,
} from '@pikku/core/trigger'

export const triggerSourceEnable = pikkuFunc<
  { name: string; baseUrl?: string; labelPrefix?: string },
  { outcome: WebhookSourceOutcome }
>({
  title: 'Turn On a Trigger Source',
  description:
    'Turns a declared trigger source on and registers it with its provider, at the address the last deployment recorded unless one is given. Sources are off until turned on here.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async (_services, input) => ({
    outcome: await enableTriggerSource(input),
  }),
})
