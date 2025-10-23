import {
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuChannelFunc,
} from '#pikku/pikku-types.gen.js'

/**
 * Connection handler
 * Called when a client connects to the channel
 *
 * These are simple wrappers around pikkuSessionlessFunc where channel always exists
 */
export const onConnect = pikkuChannelConnectionFunc<
  { welcome: string; channelId: string }, // Out - sent to client
  { room?: string } // ChannelData - from URL/query
>({
  docs: {
    summary: 'Handle chat connection',
    description: 'Called when a user connects to the chat channel',
    tags: ['chat', 'connection'],
    errors: [],
  },
  // ✅ CORRECT: channel always exists (not optional)
  func: async ({ logger, channel }) => {
    logger.info('Chat connected', {
      channelId: channel.channelId,
      room: channel.openingData.room,
    })

    return {
      welcome: 'connected to chat',
      channelId: channel.channelId,
    }
  },
})

/**
 * Disconnection handler
 * Called when a client disconnects from the channel
 */
export const onDisconnect = pikkuChannelDisconnectionFunc<{ room?: string }>({
  // ChannelData
  docs: {
    summary: 'Handle chat disconnection',
    description: 'Called when a user disconnects from the chat channel',
    tags: ['chat', 'disconnection'],
    errors: [],
  },
  // ✅ CORRECT: channel always exists
  func: async ({ logger, channel }) => {
    logger.info('Chat disconnected', {
      channelId: channel.channelId,
      state: channel.state,
    })
  },
})

/**
 * Message handler
 * Called when a client sends a message
 */
export const onMessage = pikkuChannelFunc<
  { message: string }, // In - message from client
  { received: boolean }, // Out - response to client
  { room?: string } // ChannelData
>({
  docs: {
    summary: 'Handle chat message',
    description: 'Process incoming chat messages',
    tags: ['chat', 'message'],
    errors: [],
  },
  // ✅ CORRECT: Services destructured, channel always exists
  func: async ({ logger, channel }, { message }) => {
    logger.info('Chat message received', {
      channelId: channel.channelId,
      message,
      room: channel.openingData.room,
    })

    // Return value is automatically sent to the client
    return { received: true }
  },
})
