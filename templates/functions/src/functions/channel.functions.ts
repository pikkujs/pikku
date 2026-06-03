import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '../../.pikku/pikku-types.gen.js'
import {
  ChannelAuthInputSchema,
  ChannelAuthOutputSchema,
  SubscribeInputSchema,
  SubscribeOutputSchema,
  UnsubscribeInputSchema,
  UnsubscribeOutputSchema,
} from '../schemas.js'

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

export const authenticate = pikkuChannelFunc({
  input: ChannelAuthInputSchema,
  output: ChannelAuthOutputSchema,
  func: async (
    { logger, todoStore },
    { username, password },
    { setSession }
  ) => {
    const user = todoStore.getUserByUsername(username)
    const valid =
      (username === 'demo' && password === 'test' && user?.id === 'user1') ||
      (username === 'admin' && password === 'password' && user?.id === 'user2')

    if (!valid || !user) {
      logger.info(`WebSocket authentication failed for ${username}`)
      return { authenticated: false }
    }

    if (!setSession) {
      logger.info(`WebSocket authentication unavailable for ${username}`)
      return { authenticated: false }
    }

    await setSession({ userId: user.id })
    logger.info(`WebSocket authenticated as ${user.id}`)
    return { authenticated: true, userId: user.id }
  },
})

/**
 * Subscribe to todo update events via EventHub.
 */
export const subscribe = pikkuChannelFunc({
  input: SubscribeInputSchema,
  output: SubscribeOutputSchema,
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
  input: UnsubscribeInputSchema,
  output: UnsubscribeOutputSchema,
  func: async ({ eventHub, logger }, { topic }, { channel }) => {
    if (eventHub) {
      await eventHub.unsubscribe(topic, channel.channelId)
      logger.info(`WebSocket ${channel.channelId} unsubscribed from ${topic}`)
      return { unsubscribed: true, topic }
    }
    return { unsubscribed: false, topic }
  },
})
