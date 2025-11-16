import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuSessionlessFunc,
} from '../.pikku/pikku-types.gen.js'

/**
 * WebSocket channel connection handler
 *
 * @summary Handles new WebSocket connections to the event channel
 * @description This function is triggered when a client connects to the WebSocket channel.
 * It logs the connection with any opening data provided by the client and sends a welcome
 * message ('hello!') back to the newly connected client.
 */
export const onConnect = pikkuChannelConnectionFunc<'hello!'>(
  async ({ logger, channel }) => {
    logger.info(
      `Connected to event channel with opening data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hello!')
  }
)

/**
 * WebSocket channel disconnection handler
 *
 * @summary Handles WebSocket disconnections from the event channel
 * @description This function is triggered when a client disconnects from the WebSocket channel.
 * It logs the disconnection event along with the original opening data for tracking purposes.
 */
export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger, channel }) => {
    logger.info(
      `Disconnected from event channel with data ${JSON.stringify(channel.openingData)}`
    )
  }
)

/**
 * User authentication endpoint
 *
 * @summary Authenticates a user using a token and stores session data
 * @description This function validates a user's authentication token (checking if it equals 'valid')
 * and stores the userId in the user session if authentication succeeds. It demonstrates basic
 * authentication flow and session management in Pikku.
 */
export const authenticate = pikkuSessionlessFunc<
  { token: string; userId: string },
  { authResult: boolean }
>(async ({ userSession }, data) => {
  const authResult = data.token === 'valid'
  if (authResult) {
    await userSession?.set({ userId: data.userId })
  }
  return { authResult }
})

/**
 * User logout endpoint
 *
 * @summary Clears the user's session data
 * @description This function handles user logout by clearing all session data.
 * It demonstrates session cleanup in Pikku applications.
 */
export const logout = pikkuSessionlessFunc<void, void>({
  func: async ({ userSession }) => {
    await userSession?.clear()
  },
})

/**
 * Subscribe to event channel topic
 *
 * @summary Subscribes the current channel to a named event topic
 * @description This function allows a WebSocket client to subscribe to a specific event topic
 * using the event hub. Once subscribed, the channel will receive all messages published to
 * that topic. This enables pub/sub messaging patterns in Pikku applications.
 */
export const subscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ eventHub, channel }, data) => {
    await eventHub?.subscribe(data.name, channel.channelId)
  }
)

/**
 * Unsubscribe from event channel topic
 *
 * @summary Unsubscribes the current channel from a named event topic
 * @description This function removes the WebSocket client's subscription to a specific event topic.
 * After unsubscribing, the channel will no longer receive messages published to that topic.
 * Demonstrates type-safe messaging by sending a 'valid' response to confirm unsubscription.
 */
export const unsubscribe = pikkuChannelFunc<{ name: string }, 'valid'>(
  async ({ channel, eventHub }, data) => {
    // @ts-expect-error - We should only be able to send data that is in the output type
    channel.send('invalid')

    channel.send('valid')

    await eventHub?.unsubscribe(data.name, channel.channelId)
  }
)

/**
 * Publish message to event topic
 *
 * @summary Publishes a message to a named event topic with timestamp and sender info
 * @description This function publishes a message to the specified event topic through the event hub.
 * All channels subscribed to that topic will receive the message. The message includes a timestamp
 * and the sender's identity (from the user session, or 'anonymous' if not authenticated).
 * Demonstrates pub/sub messaging with user context in Pikku.
 */
export const emitMessage = pikkuChannelFunc<
  { name: string },
  { timestamp: string; from: string } | { message: string }
>(async ({ userSession, eventHub, channel }, data) => {
  const session = await userSession?.get()

  eventHub?.publish('bob', null, {})

  await eventHub?.publish(data.name, channel.channelId, {
    timestamp: new Date().toISOString(),
    from: session ?? 'anonymous',
  })
})

/**
 * Generic message handler
 *
 * @summary Handles generic 'hello' messages on the channel
 * @description This function demonstrates a simple message handler that responds to 'hello'
 * messages with a 'hey' response. It logs the received message along with any channel
 * opening data for debugging purposes.
 */
export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger, channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hey')
  }
)
