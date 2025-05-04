import type {
  APIFunction,
  ChannelConnection,
  ChannelDisconnection,
} from '../.pikku/pikku-types.gen.js'

export const onConnect: ChannelConnection<'hello!'> = async (
  services,
  channel
) => {
  services.logger.info(
    `Connected to event channel with opening data ${JSON.stringify(channel.openingData)}`
  )
  channel.send('hello!')
}

export const onDisconnect: ChannelDisconnection = async (services, channel) => {
  services.logger.info(
    `Disconnected from event channel with data ${JSON.stringify(channel.openingData)}`
  )
}

export const authenticate: APIFunction<
  { token: string; userId: string },
  { authResult: boolean; action: 'auth' }
> = async (services, data) => {
  const authResult = data.token === 'valid'
  if (authResult) {
    await services.userSession?.set({ userId: data.userId })
  }
  return { authResult, action: 'auth' }
}

export const subscribe: APIFunction<{ name: string }, void, true> = async (
  services,
  data
) => {
  await services.eventHub?.subscribe(data.name, services.channel.channelId)
}

export const unsubscribe: APIFunction<{ name: string }, void, true> = async (
  { channel, eventHub },
  data
) => {
  await eventHub?.unsubscribe(data.name, channel.channelId)
}

export const emitMessage: APIFunction<
  { name: string },
  { timestamp: string; from: string } | { message: string },
  true
> = async (services, data) => {
  const session = await services.userSession?.get()
  await services.eventHub?.publish(data.name, services.channel.channelId, {
    timestamp: new Date().toISOString(),
    from: session ?? 'anonymous',
  })
}

export const onMessage: APIFunction<'hello', 'hey', true> = async (
  services
) => {
  services.logger.info(
    `Got a generic hello message with data ${JSON.stringify(services.channel.openingData)}`
  )
  services.channel.send('hey')
}
