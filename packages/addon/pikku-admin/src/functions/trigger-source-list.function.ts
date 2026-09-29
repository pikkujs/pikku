import { pikkuFunc } from '#pikku/addon/function'
import type { TriggerSourceRow } from '@pikku/core/services'
import { requireTriggerSourceStore } from '../lib/require-trigger-source-store.js'

export const triggerSourceList = pikkuFunc<
  null,
  { sources: TriggerSourceRow[] }
>({
  title: 'List Trigger Sources',
  description:
    'Every trigger source the store knows, whether it is enabled, and what the last enable or disable reported.',
  expose: true,
  scopes: ['admin:triggers:read'],
  func: async ({ triggerSourceStore }) => ({
    sources:
      await requireTriggerSourceStore(triggerSourceStore).listTriggerSources(),
  }),
})
