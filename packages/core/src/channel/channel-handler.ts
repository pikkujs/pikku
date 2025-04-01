import {
  CoreSingletonServices,
  CoreServices,
  JSONValue,
  CoreUserSession,
} from '../types/core.types.js'
import {
  ChannelMessageMeta,
  CoreAPIChannel,
  PikkuChannelHandler,
} from './channel.types.js'
import { verifyPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'

const getRouteMeta = (
  channelName: string,
  routingProperty?: string,
  routerValue?: string
): ChannelMessageMeta => {
  const channelsMeta = pikkuState('channel', 'meta')
  const channelMeta = channelsMeta.find(
    (channelMeta) => channelMeta.name === channelName
  )
  if (!channelMeta) {
    throw new Error(`Channel ${channelName} not found`)
  }
  if (!routingProperty) {
    if (!channelMeta.message) {
      throw new Error(`Channel ${channelName} has no default message route`)
    }
    return channelMeta.message
  }
  if (!routerValue) {
    throw new Error(
      `Channel ${channelName} requires a router value for ${routingProperty}`
    )
  }
  const route = channelMeta.messageRoutes[routingProperty]?.[routerValue]
  if (!route) {
    throw new Error(
      `Channel ${channelName} has no route for ${routingProperty}:${routerValue}`
    )
  }
  return route
}

const validateSchema = (
  logger: CoreSingletonServices['logger'],
  data: JSONValue,
  channelRoute: ChannelMessageMeta
) => {
  const schemaNames = channelRoute.inputs
  if (schemaNames) {
    // TODO
    // loadSchema(schemaNames, logger)
    // validateJson(schemaNames, data)
  }
}

const validateAuth = (
  requiresSession: boolean,
  session: CoreUserSession | undefined,
  onMessage: any
) => {
  const auth =
    typeof onMessage === 'function'
      ? requiresSession
      : onMessage.auth === undefined
        ? requiresSession
        : onMessage.auth

  if (auth && !session) {
    return false
  }
  return true
}

const validatePermissions = async (
  services: CoreServices,
  session: CoreUserSession | undefined,
  onMessage: any,
  data: unknown
) => {
  const permissions =
    typeof onMessage === 'function' ? {} : onMessage.permissions
  return await verifyPermissions(permissions, services, data, session)
}

const runFunction = async (
  services: CoreServices,
  channelHandler: PikkuChannelHandler,
  channelMessageMeta: ChannelMessageMeta,
  session: CoreUserSession | undefined,
  onMessage: any,
  data: unknown
) => {
  const func: any = typeof onMessage === 'function' ? onMessage : onMessage.func
  if (channelMessageMeta.type?.toLowerCase().includes('function')) {
    return await func(
      {
        ...services,
        channel: channelHandler.getChannel(),
      },
      data,
      session
    )
  } else {
    return await func(services, channelHandler.getChannel(), data)
  }
}

export const processMessageHandlers = (
  services: CoreServices,
  session: CoreUserSession | undefined,
  channelConfig: CoreAPIChannel<any, any>,
  channelHandler: PikkuChannelHandler
) => {
  const logger = services.logger
  const requiresSession = channelConfig.auth !== false

  const processMessage = async (
    data: JSONValue,
    onMessage: any,
    session: CoreUserSession | undefined,
    routingProperty?: string,
    routerValue?: string
  ): Promise<unknown> => {
    if (!validateAuth(requiresSession, channelHandler, onMessage)) {
      const routeMessage = routingProperty
        ? `route '${routingProperty}:${routerValue}'`
        : 'the default message route'
      logger.error(
        `Channel ${channelConfig.name} with id ${channelHandler.getChannel().channelId} requires a session for ${routeMessage}`
      )
      // TODO: Send error message back breaks typescript, but should be implemented somehow
      channelHandler.getChannel().send(`Unauthorized for ${routeMessage}`)
      return
    }

    const routeMeta = getRouteMeta(
      channelConfig.name,
      routingProperty,
      routerValue
    )

    if (routeMeta) {
      validateSchema(services.logger, data, routeMeta)
    }

    const hasPermission = await validatePermissions(
      services,
      channelHandler,
      onMessage,
      data
    )
    if (!hasPermission) {
      logger.error(
        `Channel ${channelConfig.name} requires permissions for ${routingProperty || 'default message route'}`
      )
    }

    return await runFunction(
      services,
      channelHandler,
      routeMeta,
      session,
      onMessage,
      data
    )
  }

  const onMessage = async (rawData): Promise<unknown> => {
    let result: unknown
    let processed = false

    // Route-specific handling
    if (typeof rawData === 'string' && channelConfig.onMessageRoute) {
      try {
        const messageData = JSON.parse(rawData)
        const entries = Object.entries(channelConfig.onMessageRoute)
        for (const [routingProperty, routes] of entries) {
          const routerValue = messageData[routingProperty]
          if (routerValue && routes[routerValue]) {
            processed = true
            result = await processMessage(
              messageData,
              routes[routerValue],
              session,
              routingProperty,
              routerValue
            )
            break
          }
        }

        // Default handler if no routes matched but json data was parsed
        if (!processed && channelConfig.onMessage) {
          processed = true
          result = await processMessage(
            messageData,
            channelConfig.onMessage,
            session
          )
        }
      } catch (error) {
        // Most likely a json error.. ignore
      }
    }

    // Default handler if no routes matched and json data wasn't parsed
    if (!processed && channelConfig.onMessage) {
      processed = true
      result = await processMessage(rawData, channelConfig.onMessage, session)
    }

    if (!processed) {
      logger.error(
        `No handler found for message in channel ${channelConfig.name} for ${rawData}`
      )
      logger.error(`Channel ${channelConfig}`)
    }

    return result
  }

  return onMessage
}
