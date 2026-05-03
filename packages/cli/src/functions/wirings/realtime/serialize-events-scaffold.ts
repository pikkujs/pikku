/**
 * Generates the server-side `events.gen.ts` scaffold.
 *
 * This file lives in the user's project and wires two transports against the
 * project's `eventHub` service:
 *
 *   1. WebSocket channel at `/events` — bidirectional. Clients send
 *      `{action: 'subscribe' | 'unsubscribe', topic}` over the same socket;
 *      multiple topic subscriptions per connection. On disconnect the
 *      eventHub's onChannelClosed hook auto-cleans subscriptions.
 *
 *   2. SSE endpoint at `GET /events/:topic` — one connection = one topic.
 *      Subscribes the channel, returns; the eventHub fans out via
 *      `channel.send` until the client closes. onChannelClosed cleans up.
 *
 * Both routes call `eventHub.subscribe`/`unsubscribe` with the channel id;
 * publish-side ergonomics (envelope shape) are documented in the
 * pikku-realtime skill.
 */
export const serializeEventsScaffold = (authRequired: boolean): string => {
  const auth = authRequired ? 'true' : 'false'
  return `import { z } from 'zod'
import {
  pikkuChannelFunc,
  pikkuSessionlessFunc,
  wireChannel,
  wireHTTP,
  defineChannelRoutes,
} from '../../.pikku/pikku-types.gen.js'

/**
 * Topic envelope clients receive: \`{ topic, data }\`. Functions that publish
 * events should send this shape:
 *
 *   await eventHub.publish('todo-created', null, { topic: 'todo-created', data: { todo } })
 *
 * The pikku-realtime skill covers a thin \`publishEvent\` helper to remove
 * the duplication; pick whichever style your project prefers.
 */

const TopicInput = z.object({ topic: z.string() })

const realtimeSubscribe = pikkuChannelFunc({
  description: 'Subscribe the current channel to a topic',
  input: TopicInput,
  func: async ({ eventHub }, { topic }, { channel }) => {
    if (!eventHub) {
      throw new Error(
        'Realtime channel needs an eventHub service. Add eventHub to your SingletonServices.'
      )
    }
    await eventHub.subscribe(topic, channel.channelId)
  },
})

const realtimeUnsubscribe = pikkuChannelFunc({
  description: 'Unsubscribe the current channel from a topic',
  input: TopicInput,
  func: async ({ eventHub }, { topic }, { channel }) => {
    if (!eventHub) {
      throw new Error(
        'Realtime channel needs an eventHub service. Add eventHub to your SingletonServices.'
      )
    }
    await eventHub.unsubscribe(topic, channel.channelId)
  },
})

// Pikku dispatches by the \`action\` field; client sends
//   { action: 'subscribe',   topic: 'todo-created' }
//   { action: 'unsubscribe', topic: 'todo-created' }
const realtimeRoutes = defineChannelRoutes({
  subscribe: realtimeSubscribe,
  unsubscribe: realtimeUnsubscribe,
})

wireChannel({
  name: 'events',
  route: '/events',
  auth: ${auth},
  onMessageWiring: {
    action: realtimeRoutes,
  },
  tags: ['realtime'],
})

/**
 * SSE per-topic stream. One connection = one subscription. The eventHub
 * cleans up automatically when the channel closes (onChannelClosed).
 */
const RealtimeSseInput = z.object({
  topic: z.string(),
})

const realtimeEventStream = pikkuSessionlessFunc({
  description: 'Auto-generated SSE stream for a single event-hub topic',
  input: RealtimeSseInput,
  func: async ({ eventHub }, { topic }, { channel }) => {
    if (!eventHub) {
      throw new Error(
        'Realtime SSE needs an eventHub service. Add eventHub to your SingletonServices.'
      )
    }
    if (!channel) {
      throw new Error('Realtime SSE handler invoked without a channel')
    }
    await eventHub.subscribe(topic, channel.channelId)
    // Function returns; eventHub continues pushing via channel.send until
    // the client disconnects, at which point onChannelClosed unsubscribes.
  },
})

wireHTTP({
  method: 'get',
  route: '/events/:topic',
  func: realtimeEventStream,
  auth: ${auth},
  sse: true,
  tags: ['realtime', 'sse'],
})
`
}
