import {
  pikkuFunc,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '../.pikku/pikku-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc<'hello!'>(
  async ({ logger, channel }) => {
    logger.info(
      `Connected to event channel with opening data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hello!')
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger, channel }) => {
    logger.info(
      `Disconnected from event channel with data ${JSON.stringify(channel.openingData)}`
    )
  }
)

export const authenticate = pikkuFunc<
  { token: string; userId: string },
  { authResult: boolean; action: 'auth' }
>(async ({ userSession }, data) => {
  const authResult = data.token === 'valid'
  if (authResult) {
    await userSession?.set({ userId: data.userId })
  }
  return { authResult, action: 'auth' }
})

export const subscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ eventHub, channel }, data) => {
    await eventHub?.subscribe(data.name, channel.channelId)
  }
)

export const unsubscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ channel, eventHub }, data) => {
    await eventHub?.unsubscribe(data.name, channel.channelId)
  }
)

export const emitMessage = pikkuChannelFunc<
  { name: string },
  { timestamp: string; from: string } | { message: string }
>(async ({ userSession, eventHub, channel }, data) => {
  const session = await userSession?.get()
  await eventHub?.publish(data.name, channel.channelId, {
    timestamp: new Date().toISOString(),
    from: session ?? 'anonymous',
  })
})

export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger, channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hey')
  }
)
