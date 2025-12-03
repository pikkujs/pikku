import {
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuSessionlessFunc,
} from '../.pikku/pikku-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc<'hello!'>(
  async ({ logger }, _, { channel }) => {
    logger.info(
      `Connected to event channel with opening data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hello!')
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info(
      `Disconnected from event channel with data ${JSON.stringify(channel.openingData)}`
    )
  }
)

export const authenticate = pikkuSessionlessFunc<
  { token: string; userId: string },
  { authResult: boolean }
>(async (_services, { token, userId }, { session }) => {
  const authResult = token === 'valid'
  if (authResult) {
    await session?.set({ userId })
  }
  return { authResult }
})

export const logout = pikkuSessionlessFunc<void, void>({
  func: async (_services, _data, { session }) => {
    await session?.clear()
  },
})

export const subscribe = pikkuChannelFunc<{ name: string }, void>(
  async ({ eventHub }, { name }, { channel }) => {
    await eventHub?.subscribe(name, channel.channelId)
  }
)

export const unsubscribe = pikkuChannelFunc<{ name: string }, 'valid'>(
  async ({ eventHub }, { name }, { channel }) => {
    // @ts-expect-error - We should only be able to send data that is in the output type
    channel.send('invalid')

    channel.send('valid')

    await eventHub?.unsubscribe(name, channel.channelId)
  }
)

export const emitMessage = pikkuChannelFunc<
  { name: string },
  { timestamp: string; from: string } | { message: string }
>(async ({ eventHub }, { name }, { channel, session }) => {
  const sessionData = await session?.get()

  eventHub?.publish('bob', null, {})

  await eventHub?.publish(name, channel.channelId, {
    timestamp: new Date().toISOString(),
    from: sessionData ?? 'anonymous',
  })
})

export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger }, _data, { channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    channel.send('hey')
  }
)
