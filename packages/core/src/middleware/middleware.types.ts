import type {
  CoreSingletonServices,
  CoreUserSession,
  PikkuWire,
} from '../types/core.types.js'

export type CorePikkuMiddleware<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  wires: PikkuWire,
  next: () => Promise<void>
) => Promise<void>

/**
 * Execution order: `highest` runs first (outermost in the onion), `lowest`
 * runs last, closest to the function.
 */
export type MiddlewarePriority =
  'highest' | 'high' | 'medium' | 'low' | 'lowest'

export type CorePikkuMiddlewareConfig<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  func: CorePikkuMiddleware<SingletonServices, UserSession>
  name?: string
  description?: string
  /** Execution priority. Lower runs first (outermost). Defaults to 'medium'. */
  priority?: MiddlewarePriority
}

export type CorePikkuMiddlewareFactory<
  In = any,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (input: In) => CorePikkuMiddleware<SingletonServices, UserSession>

export type CorePikkuMiddlewareGroup<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = Array<
  | CorePikkuMiddleware<SingletonServices, UserSession>
  | CorePikkuMiddlewareFactory<any, SingletonServices, UserSession>
>

export type MiddlewareMetadata =
  | {
      type: 'http'
      route: string // Route pattern (e.g., '*' for all, '/api/*' for specific)
    }
  | {
      type: 'tag'
      tag: string
    }
  | {
      type: 'wire'
      name: string
      inline?: boolean
    }
