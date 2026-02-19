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

  // Example: poll an external source every 1s and invoke the trigger
  const interval = setInterval(() => {
    trigger.invoke({ payload: `event from ${eventName}` })
  }, 1_000)

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
  func: async ({ logger, todoStore }, data) => {
    logger.info(`Trigger target received: ${data.payload}`)
    todoStore.createTodo('trigger', {
      title: data.payload,
      completed: false,
      priority: 'low',
      tags: ['trigger'],
    })
    return data
  },
  remote: true,
})
