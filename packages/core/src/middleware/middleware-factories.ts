import type {
  CoreSingletonServices,
  CoreUserSession,
} from '../types/core.types.js'
import type {
  CorePikkuChannelMiddleware,
  CorePikkuChannelMiddlewareFactory,
} from '../wirings/channel/channel.types.js'
import type { PikkuAgentMiddlewareHooks } from '../wirings/agent/agent.types.js'
import type {
  CorePikkuMiddleware,
  CorePikkuMiddlewareConfig,
  CorePikkuMiddlewareFactory,
  MiddlewarePriority,
} from './middleware.types.js'

export const pikkuMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
>(
  middleware:
    | CorePikkuMiddleware<SingletonServices, UserSession>
    | CorePikkuMiddlewareConfig<SingletonServices, UserSession>
): CorePikkuMiddleware<SingletonServices, UserSession> => {
  if (typeof middleware === 'function') return middleware
  const func = middleware.func as CorePikkuMiddleware<
    SingletonServices,
    UserSession
  > & { __priority?: MiddlewarePriority }
  if (middleware.priority) {
    func.__priority = middleware.priority
  }
  return func
}

export const pikkuMiddlewareFactory = <In = any>(
  factory: CorePikkuMiddlewareFactory<In>
): CorePikkuMiddlewareFactory<In> => {
  return factory
}

export const pikkuChannelMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Event = unknown,
>(
  middleware: CorePikkuChannelMiddleware<SingletonServices, Event>
): CorePikkuChannelMiddleware<SingletonServices, Event> => {
  return middleware
}

export const pikkuChannelMiddlewareFactory = <In = any>(
  factory: CorePikkuChannelMiddlewareFactory<In>
): CorePikkuChannelMiddlewareFactory<In> => {
  return factory
}

export const pikkuAgentMiddleware = <
  State extends Record<string, unknown> = Record<string, unknown>,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
>(
  hooks: PikkuAgentMiddlewareHooks<State, SingletonServices>
): PikkuAgentMiddlewareHooks<State, SingletonServices> => hooks
