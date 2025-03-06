import {
  CoreSingletonServices,
  CoreServices,
  JSONValue,
  CoreUserSession,
} from '../types/core.types.js'
import { CoreAPIChannel, PikkuChannelHandler } from './channel.types.js'
import { verifyPermissions } from '../permissions.js'
import { getChannels } from './channel-runner.js'

const validateSchema = (
  logger: CoreSingletonServices['logger'],
  data: JSONValue,
  channelName: string,
  routingProperty?: string,
  routerValue?: string
) => {
  const { channelsMeta } = getChannels()
  for (const channelMeta of channelsMeta) {
    if (routingProperty && routerValue) {
      const channelRoute =
        channelMeta.messageRoutes[routingProperty]?.[routerValue]
      if (channelRoute) {
        const schemaNames = channelRoute.inputs
        if (schemaNames) {
          // TODO
          // loadSchema(schemaNames, logger)
          // validateJson(schemaNames, data)
        }
        return
      }
    }
  }
}

const validateAuth = (
  requiresSession: boolean,
  userSession: CoreUserSession | undefined,
  onMessage: any
) => {
  const auth =
    typeof onMessage === 'function'
      ? requiresSession
      : onMessage.auth === undefined
        ? requiresSession
        : onMessage.auth

  if (auth && !userSession) {
    return false
  }
  return true
}

const validatePermissions = async (
  services: CoreServices,
  userSession: CoreUserSession | undefined,
  onMessage: any,
  data: unknown
) => {
  const permissions =
    typeof onMessage === 'function' ? {} : onMessage.permissions
  return await verifyPermissions(
    permissions,
    services,
    data,
    userSession
  )
}

const runFunction = async (
  services: CoreServices,
  channelHandler: PikkuChannelHandler,
  onMessage: any,
  data: unknown
) => {
  const func: any = typeof onMessage === 'function' ? onMessage : onMessage.func
  return await func(services, channelHandler.getChannel(), data)
}

export const processMessageHandlers = (
  services: CoreServices,
  channelConfig: CoreAPIChannel<any, any>,
  channelHandler: PikkuChannelHandler
) => {
  const logger = services.logger
  const requiresSession = channelConfig.auth !== false

  const processMessage = async (
    data: JSONValue,
    onMessage: any,
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

    validateSchema(
      services.logger,
      data,
      channelConfig.name,
      routingProperty,
      routerValue
    )

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

    return await runFunction(services, channelHandler, onMessage, data)
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
              routingProperty,
              routerValue
            )
            break
          }
        }

        // Default handler if no routes matched but json data was parsed
        if (!processed && channelConfig.onMessage) {
          processed = true
          result = await processMessage(messageData, channelConfig.onMessage)
        }
      } catch (error) {
        // Most likely a json error.. ignore
      }
    }

    // Default handler if no routes matched and json data wasn't parsed
    if (!processed && channelConfig.onMessage) {
      processed = true
      result = await processMessage(rawData, channelConfig.onMessage)
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
