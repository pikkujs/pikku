import { pikkuTriggerFunc } from '#pikku/trigger'
import type { TriggerInvokeOptions } from '@pikku/core/trigger'

// A controllable trigger — stores invoke callback so tests can fire it manually
const invokers = new Map<
  string,
  (data: any, options?: TriggerInvokeOptions) => void
>()

export const getInvoker = (key: string) => invokers.get(key)
export const clearInvokers = () => invokers.clear()

export const testEventTrigger = pikkuTriggerFunc<
  { eventName: string },
  { payload: string }
>(async (_services, { eventName }, { trigger }) => {
  // A closure that calls the wire keeps it bound; the bare method would hand
  // the wire's own function to the map.
  invokers.set(eventName, (data, options) => trigger.invoke(data, options))
  return () => {
    invokers.delete(eventName)
  }
})
