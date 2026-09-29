import { pikkuFunc } from '#pikku/addon/function'
import { requireTriggerSourceStore } from '../lib/require-trigger-source-store.js'

export const triggerSourceForget = pikkuFunc<
  { name: string },
  { success: boolean }
>({
  title: 'Forget an Orphaned Trigger Source',
  description:
    'Drops the record of a source whose code is gone without a teardown. Its provider registration has to be removed by hand.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async ({ triggerSourceStore }, { name }) => {
    await requireTriggerSourceStore(triggerSourceStore).deleteTriggerSource(
      name
    )
    return { success: true }
  },
})
