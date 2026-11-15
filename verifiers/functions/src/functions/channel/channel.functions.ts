import {
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuChannelFunc,
} from '#pikku/channel'
import { pikkuSessionlessFunc, pikkuSubscribeFunc } from '#pikku/function'

export const onConnect = pikkuChannelConnectionFunc<'hello!'>(
  async ({ logger }, _, { channel }) => {
    logger.info(
      `Connected to event channel with opening data ${JSON.stringify(channel.openingData)}`
    )
    await channel.send('hello!')
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
>(async (_services, { token, userId }, { setSession }) => {
  const authResult = token === 'valid'
  if (authResult) {
    await setSession?.({ userId })
  }
  return { authResult }
})

export const logout = pikkuSessionlessFunc<void, void>({
  func: async (_services, _data, { clearSession }) => {
    await clearSession?.()
  },
})

// The function decides the topic, so a client can only follow a topic this
// function returns. There is no unsubscribe: a channel leaves on disconnect.
export const subscribe = pikkuSubscribeFunc<{ name: string }, `room:${string}`>(
  async (_services, { name }) => `room:${name}`
)

export const unsubscribe = pikkuChannelFunc<{ name: string }, 'valid'>(
  async (_services, _data, { channel }) => {
    // @ts-expect-error - We should only be able to send data that is in the output type
    await channel.send('invalid')

    await channel.send('valid')
  }
)

export const emitMessage = pikkuChannelFunc<
  { name: string },
  { timestamp: string; from: string } | { message: string }
>(async ({ eventHub }, { name }, { channel, session }) => {
  const sessionData = session

  await eventHub?.publish(
    `room:${name}`,
    {
      timestamp: new Date().toISOString(),
      from: sessionData ?? 'anonymous',
    },
    { except: channel.channelId }
  )
})

export const onMessage = pikkuChannelFunc<'hello', 'hey'>(
  async ({ logger }, _data, { channel }) => {
    logger.info(
      `Got a generic hello message with data ${JSON.stringify(channel.openingData)}`
    )
    await channel.send('hey')
  }
)
