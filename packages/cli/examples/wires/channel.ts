//~ name: channel
//~ title: Realtime channel (WebSocket) — connect/disconnect + message actions
//~ when: The app needs LIVE two-way updates — presence, a chat room, a live board, push-on-change. For one-way server→client streaming/progress use {name: sse} instead.
//~ entity: todo
//~ The three lifecycle funcs share one file on purpose — they are one channel's
//~ behaviour, not three independent RPCs, and pikku discovers them by export. The
//~ wireChannel call is what must live apart.

// ===== FILE: packages/functions/src/functions/todo-channel.function.ts =====
import { pikkuChannelConnectionFunc, pikkuChannelDisconnectionFunc } from '#pikku/channel'
import { pikkuSubscribeFunc } from '#pikku/function'

//~ Connection lifecycle: send an initial frame on connect. The 3rd arg carries
//~ `channel` (channel.channelId, channel.send(...)). Generic = the send() shape.
export const onTodoConnect = pikkuChannelConnectionFunc<{ connected: true }>(
  async ({ logger }, _input, { channel }) => {
    logger.info(`connected: ${channel.channelId}`)
    channel.send({ connected: true })
  },
)

//~ A channel's subscriptions end on disconnect — just log/cleanup here.
export const onTodoDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _input, { channel }) => {
    logger.info(`disconnected: ${channel.channelId}`)
  },
)

//~ A subscribe action = a pikkuSubscribeFunc. The BODY returns the topic, so a
//~ client can only follow a topic this function hands back — it never names an
//~ arbitrary one. The function runs first (session, scopes, permissions); if it
//~ throws, nothing is subscribed. Add `scopes`/`permissions` to gate a topic.
//~ The second generic is the topic's SHAPE; publishers are checked against it.
//~ There is no unsubscribe: a channel leaves its topics on disconnect.
export const subscribeTodo = pikkuSubscribeFunc<{ list: string }, `todos:${string}`>({
  func: async ({ logger }, { list }) => {
    logger.info(`subscribing to todos:${list}`)
    return `todos:${list}`
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
//~ any function: `await eventHub.publish('todos:' + list, data)`.
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
