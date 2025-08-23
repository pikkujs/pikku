import {
  CoreServices,
  JSONValue,
  CoreUserSession,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import {
  ChannelMessageMeta,
  CoreChannel,
  PikkuChannelHandler,
} from './channel.types.js'
import { pikkuState } from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'

const getRouteMeta = (
  channelName: string,
  routingProperty?: string,
  routerValue?: string
): ChannelMessageMeta => {
  const channelMeta = pikkuState('channel', 'meta')[channelName]
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
  const route = channelMeta.messageWirings[routingProperty]?.[routerValue]
  if (!route) {
    throw new Error(
      `Channel ${channelName} has no route for ${routingProperty}:${routerValue}`
    )
  }
  return route
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

export const processMessageHandlers = (
  services: CoreServices,
  session: CoreUserSession | undefined,
  channelConfig: CoreChannel<any, any>,
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

    const { pikkuFuncName } = getRouteMeta(
      channelConfig.name,
      routingProperty,
      routerValue
    )

    const permissions =
      typeof onMessage === 'function' ? {} : onMessage.permissions

    const middleware =
      typeof onMessage === 'function' ? [] : onMessage.middleware

    return await runPikkuFunc(
      PikkuWiringTypes.channel,
      channelConfig.name,
      pikkuFuncName,
      {
        getAllServices: () => ({
          ...services,
          channel: channelHandler.getChannel(),
        }),
        data,
        session,
        permissions,
        middleware,
        tags: channelConfig.tags,
      }
    )
  }

  const onMessage = async (rawData): Promise<unknown> => {
    let result: unknown
    let processed = false

    // Route-specific handling
    if (typeof rawData === 'string' && channelConfig.onMessageWiring) {
      try {
        const messageData = JSON.parse(rawData)
        const entries = Object.entries(channelConfig.onMessageWiring)
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
        `No handler found for message in channel ${channelConfig.name} for ${JSON.stringify(rawData)}`
      )
      logger.error(`Channel ${JSON.stringify(channelConfig)}`)
    }

    return result
  }

  return onMessage
}
