import {
  pikkuTriggerFunc,
  pikkuSessionlessFunc,
} from '../../.pikku/pikku-types.gen.js'
import { OnTestEventInputSchema, OnTestEventOutputSchema } from '../schemas.js'

/**
 * Trigger: Subscribe to an external event source.
 * When an event arrives, invoke the target RPC.
 */
export const testEventTrigger = pikkuTriggerFunc<
  { eventName: string },
  { payload: string }
>(async ({ logger }, { eventName }, { trigger }) => {
  logger.info(`Trigger setup for event: ${eventName}`)

  // Example: poll an external source every 10s and invoke the trigger
  const interval = setInterval(() => {
    trigger.invoke({ payload: `event from ${eventName}` })
  }, 10_000)

  return () => {
    clearInterval(interval)
    logger.info(`Trigger teardown for event: ${eventName}`)
  }
})

/**
 * Internal RPC target invoked by the trigger above.
 */
export const onTestEvent = pikkuSessionlessFunc({
  input: OnTestEventInputSchema,
  output: OnTestEventOutputSchema,
  func: async ({ logger }, data) => {
    logger.info(`Trigger target received: ${data.payload}`)
    return data
  },
  internal: true,
})
