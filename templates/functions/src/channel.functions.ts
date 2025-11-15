import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuSessionlessFunc,
} from '../.pikku/pikku-types.gen.js'

/**
 * @summary Handle channel connection
 * @description Executed when a client connects to the WebSocket channel, logs connection info and sends welcome message
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
 * @summary Handle channel disconnection
 * @description Executed when a client disconnects from the WebSocket channel, performs cleanup and logging
 */
export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger, channel }) => {
    logger.info(
      `Disconnected from event channel with data ${JSON.stringify(channel.openingData)}`
    )
  }
)

/**
 * @summary Authenticate user session
 * @description Validates user credentials via token and establishes an authenticated session if successful
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
 * @summary Clear user session
 * @description Logs out the current user by clearing their session data
 */
export const logout = pikkuSessionlessFunc<void, void>({
  func: async ({ userSession }) => {
    await userSession?.clear()
  },
})

/**
 * @summary Subscribe to event channel
 * @description Registers the current channel to receive events published to the specified topic name
 */
export const subscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ eventHub, channel }, data) => {
    await eventHub?.subscribe(data.name, channel.channelId)
  }
)

/**
 * @summary Unsubscribe from event channel
 * @description Removes the current channel from receiving events for the specified topic name
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
 * @summary Emit message to subscribers
 * @description Publishes a timestamped message to all subscribers of the specified event channel
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
 * @summary Handle generic channel message
 * @description Processes incoming generic hello messages and responds with a hey message
 */
export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger, channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hey')
  }
)
