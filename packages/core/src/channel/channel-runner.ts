import { NotFoundError } from '../errors/errors.js'
import { addFunction } from '../function/function-runner.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import { UserSessionService } from '../services/user-session-service.js'
import {
  CoreAPIChannel,
  RunChannelOptions,
  RunChannelParams,
} from './channel.types.js'
import { match } from 'path-to-regexp'

/**
 * Adds a channel and registers all functions referenced in it using the
 * function names already stored in the channel metadata
 */
export const addChannel = <
  In,
  Channel extends string,
  ChannelFunction,
  ChannelFunctionSessionless,
  APIPermission,
>(
  channel: CoreAPIChannel<In, Channel, ChannelFunction, APIPermission>
) => {
  // Get the channel metadata
  const channelsMeta = pikkuState('channel', 'meta')
  const channelMeta = channelsMeta[channel.name]

  if (!channelMeta) {
    console.error(`Channel metadata not found for channel: ${channel.name}`)
    // Still store the channel, even without metadata
    pikkuState('channel', 'channels').push(channel as any)
    return
  }

  // Register onConnect function if provided
  if (channel.onConnect && channelMeta.connectPikkuFuncName) {
    addFunction(channelMeta.connectPikkuFuncName, channel.onConnect as any)
  }

  // Register onDisconnect function if provided
  if (channel.onDisconnect && channelMeta.disconnectPikkuFuncName) {
    addFunction(
      channelMeta.disconnectPikkuFuncName,
      channel.onDisconnect as any
    )
  }

  // Register onMessage function if provided
  if (channel.onMessage && channelMeta.message?.pikkuFuncName) {
    const messageFunc =
      typeof channel.onMessage === 'function'
        ? channel.onMessage
        : channel.onMessage.func
    addFunction(channelMeta.message.pikkuFuncName, messageFunc as any)
  }

  // Register functions in onMessageRoute
  if (channel.onMessageRoute && channelMeta.messageRoutes) {
    // Iterate through each channel in onMessageRoute
    Object.entries(channel.onMessageRoute).forEach(([channelKey, routes]) => {
      const channelRoutes = channelMeta.messageRoutes[channelKey]
      if (!channelRoutes) return

      // Iterate through each route in the channel
      Object.entries(routes).forEach(([routeKey, handler]) => {
        const routeMeta = channelRoutes[routeKey]
        if (!routeMeta) return

        // Extract the function from the handler
        const routeFunc = typeof handler === 'function' ? handler : handler.func

        // Register the function using the pikku name from metadata
        addFunction(routeMeta.pikkuFuncName, routeFunc as any)
      })
    })
  }

  // Store the channel configuration
  pikkuState('channel', 'channels').push(channel as any)
}

const getMatchingChannelConfig = (request: string) => {
  const channels = pikkuState('channel', 'channels')
  const channelsMeta = pikkuState('channel', 'meta')
  for (const channelConfig of channels) {
    const cleanedRoute = channelConfig.route.replace(/^\/\//, '/')
    const cleanedRequest = request.replace(/^\/\//, '/')
    const matchFunc = match(cleanedRoute, {
      decode: decodeURIComponent,
    })
    const matchedPath = matchFunc(cleanedRequest)
    if (matchedPath) {
      const schemaName = channelsMeta[channelConfig.route]?.input
      return {
        matchedPath,
        params: matchedPath.params,
        channelConfig,
        schemaName,
      }
    }
  }

  return null
}

export const openChannel = async ({
  route,
  singletonServices,
  coerceDataFromSchema = true,
  request,
}: Pick<CoreAPIChannel<unknown, string>, 'route'> &
  RunChannelParams<unknown> & {
    userSession: UserSessionService<any>
  } & RunChannelOptions): Promise<{
  openingData: unknown
  channelConfig: CoreAPIChannel<unknown, any>
}> => {
  const matchingChannel = getMatchingChannelConfig(route)
  if (!matchingChannel) {
    singletonServices.logger.info(`Channel not found: ${route}`)
    throw new NotFoundError(`Channel not found: ${route}`)
  }

  const { params, channelConfig, schemaName } = matchingChannel

  const requiresSession = channelConfig.auth !== false
  request?.setParams(params)

  singletonServices.logger.info(
    `Matched channel: ${channelConfig.name} | route: ${channelConfig.route} | auth: ${requiresSession.toString()}`
  )

  let openingData: any | undefined
  if (request) {
    openingData = await request.data()
    if (coerceDataFromSchema && schemaName) {
      coerceTopLevelDataFromSchema(schemaName, openingData)
    }
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      openingData
    )
  }

  return { openingData, channelConfig }
}
