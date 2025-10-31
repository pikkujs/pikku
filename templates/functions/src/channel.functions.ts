import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuSessionlessFunc,
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

export const logout = pikkuSessionlessFunc<void, void>({
  func: async ({ userSession }) => {
    await userSession?.clear()
  },
})

export const subscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ eventHub, channel }, data) => {
    await eventHub?.subscribe(data.name, channel.channelId)
  }
)

export const unsubscribe = pikkuChannelFunc<{ name: string }, 'valid'>(
  async ({ channel, eventHub }, data) => {
    // @ts-expect-error - We should only be able to send data that is in the output type
    channel.send('invalid')

    channel.send('valid')

    await eventHub?.unsubscribe(data.name, channel.channelId)
  }
)

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

export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger, channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hey')
  }
)
