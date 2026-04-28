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

const RealtimeMessageInput = z.union([
  z.object({ action: z.literal('subscribe'), topic: z.string() }),
  z.object({ action: z.literal('unsubscribe'), topic: z.string() }),
])

const realtimeChannelMessage = pikkuSessionlessFunc({
  description: 'Auto-generated /events channel subscribe/unsubscribe handler',
  input: RealtimeMessageInput,
  func: async ({ eventHub }, data, { channel }) => {
    if (!eventHub) {
      throw new Error(
        'Realtime channel needs an eventHub service. Add eventHub to your SingletonServices and instantiate (e.g. LocalEventHubService).'
      )
    }
    if (!channel) {
      throw new Error('Realtime channel handler invoked without a channel')
    }
    if (data.action === 'subscribe') {
      await eventHub.subscribe(data.topic, channel.channelId)
    } else if (data.action === 'unsubscribe') {
      await eventHub.unsubscribe(data.topic, channel.channelId)
    }
  },
})

const realtimeChannelRoutes = defineChannelRoutes({
  message: realtimeChannelMessage,
})

wireChannel({
  name: 'events',
  route: '/events',
  auth: ${auth},
  message: realtimeChannelMessage,
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
