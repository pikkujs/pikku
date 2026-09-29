import { pikkuFunc } from '#pikku/addon/function'
import { syncTriggerSources } from '@pikku/core/trigger'

export const triggerSourceSync = pikkuFunc<null, { success: boolean }>({
  title: 'Sync Declared Trigger Sources',
  description:
    'Adds a row for every trigger source the running app declares and marks the rest undeclared. Never enables or disables anything.',
  expose: true,
  scopes: ['admin:triggers:manage'],
  func: async () => {
    await syncTriggerSources()
    return { success: true }
  },
})
