export interface EventsGenOutput {
  schemas: string
  functions: string
}

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
export const serializeEventsScaffold = (
  authRequired: boolean,
  pikkuTypesImportPath: string
): EventsGenOutput => {
  const auth = authRequired ? 'true' : 'false'

  const schemas = `/**
 * Auto-generated realtime event schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const TopicRef = z.object({ topic: z.string() })
`

  const functions = `import {
  pikkuChannelFunc,
  pikkuSessionlessFunc,
  wireChannel,
  wireHTTP,
  defineChannelRoutes,
} from '${pikkuTypesImportPath}'
import { TopicRef } from './events.schemas.gen.js'

/**
 * Topic envelope clients receive: \`{ topic, data }\`. Functions that publish
 * events should send this shape:
 *
 *   await eventHub.publish('todo-created', null, { topic: 'todo-created', data: { todo } })
 *
 * The pikku-realtime skill covers a thin \`publishEvent\` helper to remove
 * the duplication; pick whichever style your project prefers.
 */

export const realtimeSubscribe = pikkuChannelFunc({
  input: TopicRef,
  func: async ({ eventHub }, { topic }, { channel }) => {
    await eventHub?.subscribe(topic, channel.channelId)
  },
})

export const realtimeUnsubscribe = pikkuChannelFunc({
  input: TopicRef,
  func: async ({ eventHub }, { topic }, { channel }) => {
    await eventHub?.unsubscribe(topic, channel.channelId)
  },
})

// Pikku dispatches by the \`action\` field; client sends
//   { action: 'subscribe',   topic: 'todo-created' }
//   { action: 'unsubscribe', topic: 'todo-created' }
export const realtimeRoutes = defineChannelRoutes({
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
  tags: ['pikku:realtime'],
})

/**
 * SSE per-topic stream. One connection = one subscription. The eventHub
 * cleans up automatically when the channel closes (onChannelClosed).
 */
export const realtimeEventStream = pikkuSessionlessFunc({
  input: TopicRef,
  description: 'Auto-generated SSE stream for a single event-hub topic',
  func: async ({ eventHub }, { topic }, { channel }) => {
    if (!channel) {
      throw new Error('Realtime SSE handler invoked without a channel')
    }
    await eventHub?.subscribe(topic, channel.channelId)
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
  tags: ['pikku:realtime', 'sse'],
})
`

  return { schemas, functions }
}
