import { pikkuFunc } from '#pikku/addon/function'
import {
  teardownTriggerSources,
  type WebhookSourceOutcome,
} from '@pikku/core/trigger'

export const triggerSourceTeardown = pikkuFunc<
  { names: string[]; baseUrl: string; labelPrefix: string },
  { outcomes: WebhookSourceOutcome[] }
>({
  title: 'Remove Trigger Sources',
  description:
    'Removes the named trigger sources from their providers. Run on the outgoing deployment for the sources the next release drops, since only the code that set a source up can remove it.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async (_services, input) => ({
    outcomes: await teardownTriggerSources(input),
  }),
})
