import type {
  CoreSingletonServices,
  CoreUserSession,
  PikkuWire,
} from '../types/core.types.js'

/**
 * Middleware around a function invocation: it receives the services and the
 * wire, and runs the rest of the chain by awaiting `next()`. Not calling `next`
 * stops the chain, so the function never runs; throwing answers with that
 * error.
 */
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

/**
 * The object form of {@link pikkuMiddleware}, for middleware that carries a
 * name, description or priority.
 */
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

/**
 * A function that takes options and returns middleware, as declared with
 * {@link pikkuMiddlewareFactory}.
 */
export type CorePikkuMiddlewareFactory<
  In = any,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (input: In) => CorePikkuMiddleware<SingletonServices, UserSession>

/**
 * A list of middleware, or middleware factories, registered together against
 * a tag or route.
 */
export type CorePikkuMiddlewareGroup<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = Array<
  | CorePikkuMiddleware<SingletonServices, UserSession>
  | CorePikkuMiddlewareFactory<any, SingletonServices, UserSession>
>

/**
 * How codegen records where a piece of inherited middleware comes from: an
 * HTTP route pattern, a tag, or a named wire-level middleware.
 * @internal
 */
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
