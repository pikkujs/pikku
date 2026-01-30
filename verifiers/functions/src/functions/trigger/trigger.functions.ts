import { pikkuTriggerFunc } from '#pikku'

// A controllable trigger — stores invoke callback so tests can fire it manually
const invokers = new Map<string, (data: any) => void>()

export const getInvoker = (key: string) => invokers.get(key)

export const testEventTrigger = pikkuTriggerFunc<
  { eventName: string },
  { payload: string }
>(async (_services, { eventName }, { trigger }) => {
  invokers.set(eventName, trigger.invoke)
  return () => {
    invokers.delete(eventName)
  }
})
