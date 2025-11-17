import { NotFoundError } from '../../errors/errors.js'
import { addFunction } from '../../function/function-runner.js'
import { CorePikkuPermission } from '../../function/functions.types.js'
import { pikkuState } from '../../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../../schema.js'
import { UserInteractionService } from '../../services/user-session-service.js'
import { CorePikkuMiddleware } from '../../types/core.types.js'
import { httpRouter } from '../http/routers/http-router.js'
import {
  ChannelMeta,
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
} from './channel.types.js'

/**
 * Adds a channel and registers all functions referenced in it using the
 * function names already stored in the channel metadata
 */
export const wireChannel = <
  In,
  Channel extends string,
  PikkuPermission extends CorePikkuPermission<In>,
  PikkuMiddleware extends CorePikkuMiddleware,
  ChannelFunction,
>(
  channel: CoreChannel<
    In,
    Channel,
    PikkuPermission,
    PikkuMiddleware,
    ChannelFunction
  >
) => {
  // Get the channel metadata
  const channelsMeta = pikkuState('channel', 'meta')
  const channelMeta = channelsMeta[channel.name]
  if (!channelMeta) {
    throw new Error(`Channel metadata not found for channel: ${channel.name}`)
  }

  pikkuState('channel', 'channels').set(channel.name, channel as any)

  // Register onConnect function if provided
  if (channel.onConnect && channelMeta.connect) {
    addFunction(channelMeta.connect.pikkuFuncName, channel.onConnect as any)
  }

  // Register onDisconnect function if provided
  if (channel.onDisconnect && channelMeta.disconnect) {
    addFunction(
      channelMeta.disconnect.pikkuFuncName,
      channel.onDisconnect as any
    )
  }

  // Register onMessage function if provided
  if (channel.onMessage && channelMeta.message?.pikkuFuncName) {
    addFunction(
      channelMeta.message.pikkuFuncName,
      (channel.onMessage as any).func instanceof Function
        ? channel.onMessage
        : (channel.onMessage as any).func
    )
  }

  // Register functions in onMessageWiring
  if (channel.onMessageWiring && channelMeta.messageWirings) {
    // Iterate through each channel in onMessageWiring
    Object.entries(channel.onMessageWiring).forEach(([channelKey, wirings]) => {
      const channelWirings = channelMeta.messageWirings[channelKey]
      if (!channelWirings) return

      // Iterate through each wiring in the channel
      Object.entries(wirings).forEach(([wiringKey, handler]) => {
        const wiringMeta = channelWirings[wiringKey]
        if (!wiringMeta) return

        // Register the function using the pikku name from metadata
        // It could be a FuncConfig or a wiring override with a funcConfig
        addFunction(
          wiringMeta.pikkuFuncName,
          (handler as any).func instanceof Function
            ? handler
            : (handler as any).func
        )
      })
    })
  }

  // Store the channel configuration
  pikkuState('channel', 'channels').set(channel.name, channel as any)
}

const getMatchingChannelConfig = (path: string) => {
  const matchedPath = httpRouter.match('get', path)
  if (!matchedPath) {
    return null
  }

  const meta = pikkuState('channel', 'meta')
  const channelMeta = Object.values(meta).find(
    (channelConfig) => channelConfig.route === matchedPath.route
  )
  if (!channelMeta) {
    return null
  }

  const channels = pikkuState('channel', 'channels')
  const channelConfig = channels.get(channelMeta.name)
  if (!channelConfig) {
    return null
  }

  return {
    matchedPath,
    params: matchedPath.params,
    channelConfig,
    schemaName: channelMeta.input,
    meta: channelMeta,
  }
}

export const openChannel = async ({
  route,
  singletonServices,
  coerceDataFromSchema = true,
  request,
}: Pick<CoreChannel<unknown, string>, 'route'> &
  RunChannelParams<unknown> & {
    userSession: UserInteractionService<any>
  } & RunChannelOptions): Promise<{
  openingData: unknown
  channelConfig: CoreChannel<unknown, any>
  meta: ChannelMeta
}> => {
  const matchingChannel = getMatchingChannelConfig(route)
  if (!matchingChannel) {
    singletonServices.logger.info(`Channel not found: ${route}`)
    throw new NotFoundError(`Channel not found: ${route}`)
  }

  const { params, channelConfig, schemaName, meta } = matchingChannel

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

  return { openingData, channelConfig, meta }
}
