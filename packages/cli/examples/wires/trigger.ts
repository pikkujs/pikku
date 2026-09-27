//~ name: trigger
//~ title: Trigger — subscribe to an external event source, invoke an RPC per event
//~ when: An OUTSIDE source should drive the app — a webhook feed, a poll of a third-party API, a message bus — turning each event into an RPC call. For a fixed clock schedule use {name: scheduled-task}; for in-app realtime use {name: channel}.
//~ entity: testEvent

// ===== FILE: packages/functions/src/functions/test-event-source.function.ts =====
import { pikkuTriggerFunc } from '#pikku/trigger'

//~ The SOURCE sets up the subscription and returns a TEARDOWN fn. Generics =
//~ <SetupInput, InvokePayload>. Call trigger.invoke(payload) whenever an event
//~ arrives; the payload becomes the TARGET func's input.
export const testEventSource = pikkuTriggerFunc<{ eventName: string }, { payload: string }>(
  async ({ logger }, { eventName }, { trigger }) => {
    logger.info(`trigger source up for ${eventName}`)
    //~ Real sources: open a webhook subscription / poll an API. Example = a poll.
    const interval = setInterval(
      () => trigger.invoke({ payload: `event from ${eventName}` }),
      1_000,
    )
    return () => {
      clearInterval(interval)
      logger.info(`trigger source down for ${eventName}`)
    }
  },
)

// ===== FILE: packages/functions/src/functions/on-test-event.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ The TARGET RPC invoked per event — a normal sessionless func doing the work.
//~ input/output are named consts — never inline at input:/output: (PKU489).
export const OnTestEventInput = z.object({ payload: z.string() })
export const OnTestEventOutput = z.object({ ok: z.boolean() })

export const onTestEvent = pikkuSessionlessFunc({
  input: OnTestEventInput,
  output: OnTestEventOutput,
  func: async ({ logger }, { payload }) => {
    logger.info(`handling event: ${payload}`)
    return { ok: true }
  },
})

// ===== FILE: packages/functions/src/wires/trigger/test-event.trigger.ts =====
import { wireTrigger, wireTriggerSource } from '#pikku/trigger'
import { onTestEvent } from '../../functions/on-test-event.function.js'
import { testEventSource } from '../../functions/test-event-source.function.js'

//~ Matching literal names. wireTrigger binds the TARGET; wireTriggerSource binds
//~ the SOURCE + its setup input.
wireTrigger({ name: 'test-event', func: onTestEvent })
wireTriggerSource({ name: 'test-event', func: testEventSource, input: { eventName: 'test-event' } })
