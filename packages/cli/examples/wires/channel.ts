//~ name: channel
//~ title: Realtime channel (WebSocket) — connect/disconnect + message actions
//~ when: The app needs LIVE two-way updates — presence, a chat room, a live board, push-on-change. For one-way server→client streaming/progress use {name: sse} instead.
//~ entity: todo
//~ The three lifecycle funcs share one file on purpose — they are one channel's
//~ behaviour, not three independent RPCs, and pikku discovers them by export. The
//~ wireChannel call is what must live apart.

// ===== FILE: packages/functions/src/functions/todo-channel.function.ts =====
import { z } from 'zod'
import { pikkuChannelFunc, pikkuChannelConnectionFunc, pikkuChannelDisconnectionFunc } from '#pikku/channel'

//~ Connection lifecycle: send an initial frame on connect. The 3rd arg carries
//~ `channel` (channel.channelId, channel.send(...)). Generic = the send() shape.
export const onTodoConnect = pikkuChannelConnectionFunc<{ connected: true }>(
  async ({ logger }, _input, { channel }) => {
    logger.info(`connected: ${channel.channelId}`)
    channel.send({ connected: true })
  },
)

//~ EventHub auto-unsubscribes on disconnect — just log/cleanup here.
export const onTodoDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _input, { channel }) => {
    logger.info(`disconnected: ${channel.channelId}`)
  },
)

//~ A message action = a pikkuChannelFunc with input/output zod. `setSession`
//~ (3rd arg) authenticates the socket; after it, later actions see the session.
//~ input/output are ALWAYS named module-level consts — NEVER inline at the
//~ input:/output: site (pikku rejects inline expressions with PKU489).
export const SubscribeTodoInput = z.object({ topic: z.string() })
export const SubscribeTodoOutput = z.object({ subscribed: z.boolean(), topic: z.string() })

export const subscribeTodo = pikkuChannelFunc({
  input: SubscribeTodoInput,
  output: SubscribeTodoOutput,
  func: async ({ eventHub, logger }, { topic }, { channel }) => {
    await eventHub?.subscribe(topic, channel.channelId)
    logger.info(`${channel.channelId} subscribed to ${topic}`)
    return { subscribed: Boolean(eventHub), topic }
  },
})

// ===== FILE: packages/functions/src/wires/channel/todos-live.channel.ts =====
import { wireChannel } from '#pikku/channel'
import {
  onTodoConnect,
  onTodoDisconnect,
  subscribeTodo,
} from '../../functions/todo-channel.function.js'

//~ `onMessageWiring.action` maps an action name (the client sends
//~ { action: 'subscribe', ... }) to a func. Reuse existing RPC funcs here too
//~ (e.g. list/create) — the socket calls them live. Broadcast to subscribers from
//~ any function: `await eventHub.publish(topic, data)`.
wireChannel({
  name: 'todos-live',
  route: '/',
  onConnect: onTodoConnect,
  onDisconnect: onTodoDisconnect,
  onMessageWiring: {
    action: {
      subscribe: { func: subscribeTodo },
    },
  },
  tags: ['realtime'],
})
