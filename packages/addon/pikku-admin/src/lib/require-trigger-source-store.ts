import type { TriggerSourceStore } from '@pikku/core/services'

export const requireTriggerSourceStore = (
  store: TriggerSourceStore | undefined
): TriggerSourceStore => {
  if (!store) {
    throw new Error('No triggerSourceStore is configured')
  }
  return store
}
