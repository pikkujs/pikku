import { UserSessionService } from './services/user-session-service.js'
import {
  CoreSingletonServices,
  PikkuInteraction,
  CorePikkuMiddleware,
  PikkuWiringTypes,
  MiddlewareMetadata,
} from './types/core.types.js'
import { pikkuState } from './pikku-state.js'
import { freezeDedupe } from './utils.js'

/**
 * Runs a chain of middleware functions in sequence before executing the main function.
 *
 * @param services - An object containing services (e.g., singletonServices, userSession, etc.)
 * @param interaction - The interaction context, e.g., { http }.
 * @param middlewares - An array of middleware functions to run.
 * @param main - The main function to execute after all middleware have run.
 * @returns A promise resolving to the result of the main function.
 *
 * @example
 * runMiddleware(
 *   { ...services, userSession },
 *   { http },
 *   [middleware1, middleware2, middleware3],
 *   async () => { return await runMain(); }
 * );
 */
export const runMiddleware = async <Middleware extends CorePikkuMiddleware>(
  services: CoreSingletonServices & {
    userSession?: UserSessionService<any>
  },
  interaction: PikkuInteraction,
  middlewares: readonly Middleware[],
  main?: () => Promise<unknown>
): Promise<unknown> => {
  // Deduplicate middleware using Set to avoid running the same middleware multiple times
  let result: any
  const dispatch = async (index: number): Promise<any> => {
    if (middlewares && index < middlewares.length) {
      return await middlewares[index]!(services as any, interaction, () =>
        dispatch(index + 1)
      )
    } else if (main) {
      result = await main()
    }
  }
  await dispatch(0)
  return result
}

/**
 * Adds global middleware for a specific tag.
 *
 * This function allows you to register middleware that will be applied to
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 *
 * @template PikkuMiddleware The middleware type.
 * @param {string} tag - The tag that the middleware should apply to.
 * @param {PikkuMiddleware[]} middleware - The middleware array to apply for the specified tag.
 *
 * @throws {Error} If middleware for the tag already exists.
 *
 * @example
 * ```typescript
 * // Add admin middleware for admin endpoints
 * addMiddleware('admin', [adminMiddleware])
 *
 * // Add authentication middleware for auth endpoints
 * addMiddleware('auth', [authMiddleware])
 *
 * // Add logging middleware for all API endpoints
 * addMiddleware('api', [loggingMiddleware])
 * ```
 */
export const addMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  _tag: string,
  _middleware: PikkuMiddleware[]
) => {
  // This doesn't need to do anything at runtime - it's used by the CLI to generate
}

/**
 * Registers a single middleware function by name in the global middleware store.
 *
 * This function is used by CLI-generated code to register middleware functions
 * that can be referenced by name in metadata. It stores middleware in a special
 * namespace to avoid conflicts with tag-based middleware.
 *
 * @param {string} name - The unique name (pikkuFuncName) of the middleware function.
 * @param {CorePikkuMiddleware} middleware - The middleware function to register.
 *
 * @example
 * ```typescript
 * // Called by CLI-generated pikku-middleware.gen.ts
 * registerMiddleware('authMiddleware_src_middleware_ts_10_5', authMiddleware)
 * registerMiddleware('loggingMiddleware_src_middleware_ts_20_10', loggingMiddleware)
 * ```
 */
export const registerMiddleware = (
  name: string,
  middleware: CorePikkuMiddleware
) => {
  const middlewareStore = pikkuState('misc', 'middleware')
  middlewareStore[name] = [middleware]
}

/**
 * Retrieves a registered middleware function by its name.
 *
 * This function looks up middleware that was registered with registerMiddleware.
 * It's used internally by the framework to resolve middleware references in metadata.
 *
 * @param {string} name - The unique name (pikkuFuncName) of the middleware function.
 * @returns {CorePikkuMiddleware | undefined} The middleware function, or undefined if not found.
 *
 * @internal
 */
export const getMiddlewareByName = (
  name: string
): CorePikkuMiddleware | undefined => {
  const middlewareStore = pikkuState('misc', 'middleware')
  const middleware = middlewareStore[name]
  return middleware?.[0]
}

const middlewareCache: Record<
  PikkuWiringTypes,
  Record<string, readonly CorePikkuMiddleware[]>
> = {
  [PikkuWiringTypes.http]: {},
  [PikkuWiringTypes.rpc]: {},
  [PikkuWiringTypes.channel]: {},
  [PikkuWiringTypes.queue]: {},
  [PikkuWiringTypes.scheduler]: {},
  [PikkuWiringTypes.mcp]: {},
  [PikkuWiringTypes.cli]: {},
}

/**
 * Combines wiring-specific middleware with function-level middleware.
 *
 * This function resolves middleware metadata into actual middleware functions and combines them.
 * It filters out wire middleware without tags from inheritedMiddleware to avoid duplication
 * (those are passed separately as wireMiddleware).
 *
 * @param {object} options - Configuration object for combining middleware.
 * @param {MiddlewareMetadata[] | undefined} options.inheritedMiddleware - Metadata from wiring (HTTP + tags + wire with tags).
 * @param {CorePikkuMiddleware[] | undefined} options.wireMiddleware - Inline wire middleware.
 * @param {MiddlewareMetadata[] | undefined} options.funcMiddleware - Function middleware metadata.
 * @returns {CorePikkuMiddleware[]} Combined array of resolved middleware.
 *
 * @example
 * ```typescript
 * const combined = combineMiddleware(wireType, wireId, {
 *   inheritedMiddleware: meta.middleware,
 *   wireMiddleware: [inlineMiddleware],
 *   funcMiddleware: funcMeta.middleware
 * })
 * ```
 */
export const combineMiddleware = (
  wireType: PikkuWiringTypes,
  uid: string,
  {
    wireInheritedMiddleware,
    wireMiddleware,
    funcInheritedMiddleware,
    funcMiddleware,
  }: {
    wireInheritedMiddleware?: MiddlewareMetadata[]
    wireMiddleware?: CorePikkuMiddleware[]
    funcInheritedMiddleware?: MiddlewareMetadata[]
    funcMiddleware?: CorePikkuMiddleware[]
  } = {}
): readonly CorePikkuMiddleware[] => {
  if (middlewareCache[wireType][uid]) {
    return middlewareCache[wireType][uid]
  }

  // Resolve inherited middleware metadata, filtering out wire middleware without tags
  // (those are passed separately as wireMiddleware to avoid duplication)
  const resolvedInheritedWireMiddleware: CorePikkuMiddleware[] = []
  if (wireInheritedMiddleware) {
    for (const meta of wireInheritedMiddleware) {
      // Skip wire middleware without tags - those are passed separately
      if (meta.type === 'wire' && !meta.tag) {
        continue
      }
      const middleware = getMiddlewareByName(meta.name)
      if (middleware) {
        resolvedInheritedWireMiddleware.push(middleware)
      }
    }
  }

  const resolvedInheritedFuncMiddleware: CorePikkuMiddleware[] = []
  if (funcInheritedMiddleware) {
    for (const meta of funcInheritedMiddleware) {
      // Skip function middleware without tags - those are passed separately
      if (meta.type !== 'tag') {
        continue
      }
      const middleware = getMiddlewareByName(meta.name)
      if (middleware) {
        resolvedInheritedFuncMiddleware.push(middleware)
      }
    }
  }

  // Run middleware in specific order:
  // 1) inheritedMiddleware (HTTP + tag-based + wire with tags)
  // 2) wireMiddleware (inline wire middleware)
  // 3) funcMiddleware (function tags + function inline)
  middlewareCache[wireType][uid] = freezeDedupe([
    ...resolvedInheritedWireMiddleware,
    ...(wireMiddleware || []),
    ...resolvedInheritedFuncMiddleware,
    ...(funcMiddleware || []),
  ]) as readonly CorePikkuMiddleware[]

  return middlewareCache[wireType][uid]
}
