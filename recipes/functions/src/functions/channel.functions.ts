import {
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuChannelFunc,
} from '#pikku/channel'
import { pikkuSubscribeFunc } from '#pikku/function'
import { ChannelAuthInputSchema, ChannelAuthOutputSchema } from '../schemas.js'

/**
 * Handle new WebSocket connection.
 */
export const onConnect = pikkuChannelConnectionFunc<{ connected: true }>(
  async ({ logger }, _, { channel }) => {
    logger.info(`WebSocket connected: ${channel.channelId}`)
    await channel.send({ connected: true })
  }
)

/**
 * Handle WebSocket disconnection.
 * Note: the event hub drops a channel's subscriptions on disconnect.
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
 * Subscribe to todo update events. The function decides the topic, so a client
 * can only follow a `todo-*` topic; there is no unsubscribe, a channel leaves
 * on disconnect.
 */
export const subscribe = pikkuSubscribeFunc<
  { topic: 'created' | 'updated' | 'deleted' | 'completed' },
  `todo-${string}`
>({
  func: async ({ logger }, { topic }) => {
    logger.info(`WebSocket subscribing to todo-${topic}`)
    return `todo-${topic}`
  },
})
