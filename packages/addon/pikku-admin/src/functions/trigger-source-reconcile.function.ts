import { pikkuFunc } from '#pikku/addon/function'
import {
  reconcileTriggerSources,
  type WebhookSourceOutcome,
} from '@pikku/core/trigger'

export const triggerSourceReconcile = pikkuFunc<
  { baseUrl: string; labelPrefix: string },
  { outcomes: WebhookSourceOutcome[] }
>({
  title: 'Set Up Declared Trigger Sources',
  description:
    'Registers every trigger source the running app declares with its provider, repairing any that drifted. Run after a deployment goes live.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async (_services, input) => ({
    outcomes: await reconcileTriggerSources(input),
  }),
})
