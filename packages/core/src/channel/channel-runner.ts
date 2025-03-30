import { NotFoundError } from '../errors/errors.js'
import { pikkuState } from '../pikku-state.js'
import { coerceQueryStringToArray, validateSchema } from '../schema.js'
import { UserSessionService } from '../services/user-session-service.js'
import {
  CoreAPIChannel,
  RunChannelOptions,
  RunChannelParams,
} from './channel.types.js'
import { match } from 'path-to-regexp'

export const addChannel = <
  In,
  Channel extends string,
  ChannelFunction,
  ChannelFunctionSessionless,
  APIPermission,
>(
  channel: CoreAPIChannel<
    In,
    Channel,
    ChannelFunction,
    ChannelFunctionSessionless,
    APIPermission
  >
) => {
  pikkuState('channel', 'channels').push(channel as any)
}

export const getMatchingChannelConfig = (request: string) => {
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
      const schemaName = channelsMeta.find(
        (channelMeta) => channelMeta.route === channelConfig.route
      )?.input
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
  coerceToArray = false,
  http,
}: Pick<CoreAPIChannel<unknown, string>, 'route'> &
  Omit<RunChannelParams<unknown>, 'response' | 'request'> & {
    userSessionService: UserSessionService<any>
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
  http?.request?.setParams(params)

  singletonServices.logger.info(
    `Matched channel: ${channelConfig.name} | route: ${channelConfig.route} | auth: ${requiresSession.toString()}`
  )

  let openingData: any | undefined
  if (http?.request) {
    openingData = await http.request.getData()
    if (coerceToArray && schemaName) {
      coerceQueryStringToArray(schemaName, openingData)
    }
    validateSchema(
      singletonServices.logger,
      singletonServices.schemaService,
      schemaName,
      openingData
    )
  }

  return { openingData, channelConfig }
}
