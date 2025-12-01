import { z } from 'zod'
import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '../../.pikku/pikku-types.gen.js'

/**
 * Handle new WebSocket connection.
 */
export const onConnect = pikkuChannelConnectionFunc<{ connected: true }>(
  async ({ logger }, _, { channel }) => {
    logger.info(`WebSocket connected: ${channel.channelId}`)
    channel.send({ connected: true })
  }
)

/**
 * Handle WebSocket disconnection.
 * Note: EventHub automatically unsubscribes on disconnect.
 */
export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info(`WebSocket disconnected: ${channel.channelId}`)
  }
)

/**
 * Subscribe to todo update events via EventHub.
 */
export const subscribe = pikkuChannelFunc({
  input: z.object({
    topic: z
      .enum(['todo-created', 'todo-updated', 'todo-deleted', 'todo-completed'])
      .describe('Event topic to subscribe to'),
  }),
  output: z.object({
    subscribed: z.boolean(),
    topic: z.string(),
  }),
  func: async ({ eventHub, logger }, { topic }, { channel }) => {
    if (eventHub) {
      await eventHub.subscribe(topic, channel.channelId)
      logger.info(`WebSocket ${channel.channelId} subscribed to ${topic}`)
      return { subscribed: true, topic }
    }
    return { subscribed: false, topic }
  },
})

/**
 * Unsubscribe from todo update events.
 */
export const unsubscribe = pikkuChannelFunc({
  input: z.object({
    topic: z
      .enum(['todo-created', 'todo-updated', 'todo-deleted', 'todo-completed'])
      .describe('Event topic to unsubscribe from'),
  }),
  output: z.object({
    unsubscribed: z.boolean(),
    topic: z.string(),
  }),
  func: async ({ eventHub, logger }, { topic }, { channel }) => {
    if (eventHub) {
      await eventHub.unsubscribe(topic, channel.channelId)
      logger.info(`WebSocket ${channel.channelId} unsubscribed from ${topic}`)
      return { unsubscribed: true, topic }
    }
    return { unsubscribed: false, topic }
  },
})
