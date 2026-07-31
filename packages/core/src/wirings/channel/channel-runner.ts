import { NotFoundError } from '../../errors/errors.js'
import { addFunction } from '../../function/function-runner.js'
import type { CorePikkuPermission } from '../../function/functions.types.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../../schema.js'
import type { SessionService } from '../../services/user-session-service.js'
import type { CorePikkuMiddleware } from '../../types/core.types.js'
import { httpRouter } from '../http/routers/http-router.js'
import type {
  ChannelMeta,
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
} from './channel.types.js'

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
  const channelsMeta = pikkuState(null, 'channel', 'meta')
  const channelMeta = channelsMeta[channel.name]
  if (!channelMeta) {
    console.warn(
      `[pikku] Skipping channel '${channel.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  if (channel.onConnect && channelMeta.connect) {
    addFunction(channelMeta.connect.pikkuFuncId, channel.onConnect as any)
  }

  if (channel.onDisconnect && channelMeta.disconnect) {
    addFunction(channelMeta.disconnect.pikkuFuncId, channel.onDisconnect as any)
  }

  if (channel.onMessage && channelMeta.message?.pikkuFuncId) {
    addFunction(
      channelMeta.message.pikkuFuncId,
      (channel.onMessage as any).func instanceof Function
        ? channel.onMessage
        : (channel.onMessage as any).func
    )
  }

  if (channel.onMessageWiring && channelMeta.messageWirings) {
    Object.entries(channel.onMessageWiring).forEach(([channelKey, wirings]) => {
      const channelWirings = channelMeta.messageWirings[channelKey]
      if (!channelWirings) return

      Object.entries(wirings).forEach(([wiringKey, handler]) => {
        const wiringMeta = channelWirings[wiringKey]
        if (!wiringMeta) return

        addFunction(
          wiringMeta.pikkuFuncId,
          (handler as any).func instanceof Function
            ? handler
            : (handler as any).func
        )
      })
    })
  }

  pikkuState(null, 'channel', 'channels').set(channel.name, channel as any)
}

const getMatchingChannelConfig = (path: string) => {
  const matchedPath = httpRouter.match('get', path)
  if (!matchedPath) {
    return null
  }

  const meta = pikkuState(null, 'channel', 'meta')
  const channelMeta = Object.values(meta).find(
    (channelConfig) => channelConfig.route === matchedPath.route
  )
  if (!channelMeta) {
    return null
  }

  const channels = pikkuState(null, 'channel', 'channels')
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
  coerceDataFromSchema = true,
  request,
}: Pick<CoreChannel<unknown, string>, 'route'> &
  RunChannelParams<unknown> & {
    userSession: SessionService<any>
  } & RunChannelOptions): Promise<{
  openingData: unknown
  channelConfig: CoreChannel<unknown, any>
  meta: ChannelMeta
}> => {
  const singletonServices = getSingletonServices()
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
