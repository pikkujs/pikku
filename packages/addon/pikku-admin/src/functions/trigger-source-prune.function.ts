import { pikkuFunc } from '#pikku/addon/function'
import { requireTriggerSourceStore } from '../lib/require-trigger-source-store.js'

export const triggerSourcePrune = pikkuFunc<
  { force?: boolean },
  { pruned: string[] }
>({
  title: 'Prune Undeclared Trigger Sources',
  description:
    'Removes trigger sources whose declaration has gone from code. One still enabled is kept unless forced: its provider registration outlived the code that could remove it.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async ({ triggerSourceStore }, { force }) => ({
    pruned: await requireTriggerSourceStore(
      triggerSourceStore
    ).pruneTriggerSources({ force }),
  }),
})
