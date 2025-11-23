import {
  CoreServices,
  JSONValue,
  CoreUserSession,
} from '../../types/core.types.js'
import {
  ChannelMessageMeta,
  CoreChannel,
  PikkuChannelHandler,
} from './channel.types.js'
import { pikkuState } from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { SessionService } from '../../services/user-session-service.js'

const getRouteMeta = (
  channelName: string,
  routingProperty?: string,
  routerValue?: string
): ChannelMessageMeta => {
  const channelMeta = pikkuState('', 'channel', 'meta')[channelName]
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
  channelConfig: CoreChannel<any, any>,
  channelHandler: PikkuChannelHandler,
  userSession?: SessionService<CoreUserSession>
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

    const {
      pikkuFuncName,
      middleware: routeInheritedMiddleware,
      permissions: inheritedPermissions,
    } = getRouteMeta(channelConfig.name, routingProperty, routerValue)

    // Get wire middleware: channel-level middleware + message-specific middleware
    const channelWireMiddleware = channelConfig.middleware || []

    // Check if onMessage is a wrapper object vs direct function config:
    // - Direct config: onMessage.func is a plain Function
    // - Wrapper: onMessage.func is a CorePikkuFunctionConfig (has onMessage.func.func)
    // - Simple wrapper: onMessage has both func (plain Function) and middleware properties
    const isWrapper =
      onMessage &&
      typeof onMessage === 'object' &&
      'func' in onMessage &&
      ((typeof onMessage.func === 'object' && 'func' in onMessage.func) ||
        'middleware' in onMessage)
    const messageWireMiddleware = isWrapper ? onMessage.middleware || [] : []

    // Combine channel middleware with message middleware (actual functions)
    // Channel middleware runs first, then message middleware
    const wireMiddleware = [...channelWireMiddleware, ...messageWireMiddleware]

    // Inherited middleware comes from metadata (tag groups, non-inline wire)
    const inheritedMiddleware = routeInheritedMiddleware || []

    const wirePermissions = isWrapper ? onMessage.permissions : undefined

    // Create unique cache key that includes routing info to avoid cache collisions
    // when multiple message handlers use the same function
    const cacheKey = routingProperty
      ? `${channelConfig.name}:${routingProperty}:${routerValue}`
      : `${channelConfig.name}:default`

    return await runPikkuFunc('channel', cacheKey, pikkuFuncName, {
      singletonServices: services,
      data: () => data,
      inheritedMiddleware,
      wireMiddleware,
      inheritedPermissions,
      wirePermissions,
      tags: channelConfig.tags,
      wire: {
        channel: channelHandler.getChannel(),
        session: userSession,
      },
    })
  }

  return async (rawData): Promise<unknown> => {
    let result: unknown
    let processed = false

    // Route-specific handling
    if (typeof rawData === 'string' && channelConfig.onMessageWiring) {
      let messageData: any
      try {
        messageData = JSON.parse(rawData)
      } catch (error) {
        // Most likely a json error.. ignore
      }

      if (messageData) {
        const entries = Object.entries(channelConfig.onMessageWiring)
        for (const [routingProperty, routes] of entries) {
          const routerValue = messageData[routingProperty]
          if (routerValue && routes[routerValue]) {
            const { [routingProperty]: _, ...data } = messageData

            processed = true
            result =
              (await processMessage(
                data as any,
                routes[routerValue],
                routingProperty,
                routerValue
              )) || {}
            ;(result as any)[routingProperty] = routerValue
            break
          }
        }

        // Default handler if no routes matched but json data was parsed
        if (!processed && channelConfig.onMessage) {
          processed = true
          result = await processMessage(messageData, channelConfig.onMessage)
        }
      }
    }

    // Default handler if no routes matched and json data wasn't parsed
    if (!processed && channelConfig.onMessage) {
      processed = true
      result = await processMessage(rawData, channelConfig.onMessage)
    }

    if (!processed) {
      logger.error(
        `No handler found for message in channel ${channelConfig.name} for ${JSON.stringify(rawData)}`
      )
      logger.error(`Channel ${JSON.stringify(channelConfig)}`)
    }

    return result
  }
}
