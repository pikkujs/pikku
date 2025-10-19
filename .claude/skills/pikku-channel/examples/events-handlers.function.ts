import {
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuChannelFunc,
} from '#pikku/pikku-types.gen.js'

/**
 * Connection handler for events channel
 */
export const onConnect = pikkuChannelConnectionFunc<
  { connected: true },
  { clientType: string }
>({
  docs: {
    summary: 'Handle events connection',
    tags: ['events', 'connection'],
    errors: [],
  },
  func: async ({ logger, channel }) => {
    logger.info('Events connected', {
      channelId: channel.channelId,
      clientType: channel.openingData.clientType,
    })
    return { connected: true }
  },
})

/**
 * Disconnection handler
 */
export const onDisconnect = pikkuChannelDisconnectionFunc<{
  clientType: string
}>({
  docs: {
    summary: 'Handle events disconnection',
    tags: ['events', 'disconnection'],
    errors: [],
  },
  func: async ({ logger, channel }) => {
    logger.info('Events disconnected', { channelId: channel.channelId })
  },
})

/**
 * Authenticate action - sets userSession for WebSocket
 * Called with: { "action": "authenticate", "apiKey": "..." }
 */
export const authenticate = pikkuChannelFunc<
  { apiKey: string },
  { authenticated: boolean },
  { clientType: string }
>({
  docs: {
    summary: 'Authenticate WebSocket connection',
    description: 'Validates API key and sets user session',
    tags: ['events', 'auth'],
    errors: ['UnauthorizedError'],
  },
  // ✅ CORRECT: Destructure services including userSession
  func: async ({ logger, channel, userSession, apiKeyService }, { apiKey }) => {
    logger.info('Authenticating channel', { channelId: channel.channelId })

    // Validate API key and get user
    const user = await apiKeyService.validateApiKey(apiKey)
    if (!user) {
      throw new UnauthorizedError('Invalid API key')
    }

    // ✅ CORRECT: Set userSession by passing the session object
    await userSession.set({ userId: user.id, role: user.role })

    logger.info('Channel authenticated', {
      channelId: channel.channelId,
      userId: user.id,
    })

    return { authenticated: true }
  },
})

/**
 * Subscribe action - handles "subscribe" messages
 */
export const subscribe = pikkuChannelFunc<
  { topic: string },
  { subscribed: boolean },
  { clientType: string }
>({
  docs: {
    summary: 'Subscribe to a topic',
    tags: ['events', 'subscribe'],
    errors: [],
  },
  // ✅ CORRECT: Destructure services, channel always exists
  func: async ({ logger, channel, eventHub }, { topic }) => {
    logger.info('Subscribing to topic', {
      topic,
      channelId: channel.channelId,
    })

    // Subscribe this channel to the topic
    await eventHub.subscribe(topic, channel.channelId)

    return { subscribed: true }
  },
})

/**
 * Unsubscribe action - handles "unsubscribe" messages
 */
export const unsubscribe = pikkuChannelFunc<
  { topic: string },
  { unsubscribed: boolean },
  { clientType: string }
>({
  docs: {
    summary: 'Unsubscribe from a topic',
    tags: ['events', 'unsubscribe'],
    errors: [],
  },
  func: async ({ logger, channel, eventHub }, { topic }) => {
    logger.info('Unsubscribing from topic', {
      topic,
      channelId: channel.channelId,
    })

    await eventHub.unsubscribe(topic, channel.channelId)

    return { unsubscribed: true }
  },
})

/**
 * Default message handler - used as fallback
 */
export const defaultHandler = pikkuChannelFunc<
  unknown,
  { error: string },
  { clientType: string }
>({
  docs: {
    summary: 'Default message handler',
    tags: ['events', 'fallback'],
    errors: [],
  },
  func: async ({ logger }, data) => {
    logger.warn('Unknown message action', { data })
    return { error: 'Unknown action' }
  },
})
