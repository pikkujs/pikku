import {
  CoreSingletonServices,
  PikkuWire,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  PikkuWiringTypes,
  MiddlewareMetadata,
} from './types/core.types.js'
import { pikkuState } from './pikku-state.js'
import { freezeDedupe } from './utils.js'

/**
 * Runs a chain of middleware functions in sequence before executing the main function.
 *
 * @param services - An object containing services (e.g., singletonServices, userSession, etc.)
 * @param wire - The wire context, e.g., { http }.
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
  services: CoreSingletonServices,
  wire: PikkuWire,
  middlewares: readonly Middleware[],
  main?: () => Promise<unknown>
): Promise<unknown> => {
  // Deduplicate middleware using Set to avoid running the same middleware multiple times
  let result: any
  const dispatch = async (index: number): Promise<any> => {
    if (middlewares && index < middlewares.length) {
      return await middlewares[index]!(services as any, wire, () =>
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
 * Registers global middleware for a specific tag.
 *
 * This function registers middleware at runtime that will be applied to
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP, CLI) that includes the matching tag.
 *
 * For tree-shaking benefits, wrap in a factory function:
 * `export const x = () => addMiddleware('tag', [...])`
 *
 * Accepts an array that can contain:
 * - Direct middleware functions (CorePikkuMiddleware)
 * - Factory middleware functions (CorePikkuMiddlewareFactory)
 *
 * @template PikkuMiddleware The middleware type.
 * @param {string} tag - The tag that the middleware should apply to.
 * @param {CorePikkuMiddlewareGroup} middleware - Array of middleware for this tag.
 *
 * @returns {CorePikkuMiddlewareGroup} The middleware array (for chaining/wrapping).
 *
 * @example
 * ```typescript
 * // Recommended: tree-shakeable
 * export const adminMiddleware = () => addMiddleware('admin', [
 *   authMiddleware,
 *   loggingMiddleware({ level: 'info' })
 * ])
 *
 * // Also works: no tree-shaking
 * export const apiMiddleware = addMiddleware('api', [
 *   rateLimitMiddleware
 * ])
 * ```
 */
export const addMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  tag: string,
  middleware: CorePikkuMiddlewareGroup
): CorePikkuMiddlewareGroup => {
  const tagGroups = pikkuState('', 'middleware', 'tagGroup')
  tagGroups[tag] = middleware
  return middleware
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
  const middlewareStore = pikkuState('', 'misc', 'middleware')
  const middleware = middlewareStore[name]
  return middleware?.[0]
}

const middlewareCache: Record<
  PikkuWiringTypes,
  Record<string, readonly CorePikkuMiddleware[]>
> = {
  http: {},
  rpc: {},
  channel: {},
  queue: {},
  scheduler: {},
  mcp: {},
  cli: {},
  workflow: {},
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

  const resolved: CorePikkuMiddleware[] = []

  // 1. Resolve wire inherited middleware (HTTP + tag groups + individual wire middleware)
  if (wireInheritedMiddleware) {
    for (const meta of wireInheritedMiddleware) {
      if (meta.type === 'http') {
        // Look up HTTP middleware group from pikkuState
        const group = pikkuState('', 'middleware', 'httpGroup')[meta.route]
        if (group) {
          // At runtime, all factories should be resolved to middleware
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      } else if (meta.type === 'tag') {
        // Look up tag middleware group from pikkuState
        const group = pikkuState('', 'middleware', 'tagGroup')[meta.tag]
        if (group) {
          // At runtime, all factories should be resolved to middleware
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      } else if (meta.type === 'wire') {
        // Individual wire middleware (exported, not inline)
        const middleware = getMiddlewareByName(meta.name)
        if (middleware) {
          resolved.push(middleware)
        }
      }
    }
  }

  // 2. Add inline wire middleware
  if (wireMiddleware) {
    resolved.push(...wireMiddleware)
  }

  // 3. Resolve function inherited middleware (only tags, wire middleware already handled)
  if (funcInheritedMiddleware) {
    for (const meta of funcInheritedMiddleware) {
      if (meta.type === 'tag') {
        // Look up tag middleware group from pikkuState
        const group = pikkuState('', 'middleware', 'tagGroup')[meta.tag]
        if (group) {
          // At runtime, all factories should be resolved to middleware
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      }
      // Note: wire middleware is already handled in wireInheritedMiddleware
    }
  }

  // 4. Add inline function middleware
  if (funcMiddleware) {
    resolved.push(...funcMiddleware)
  }

  // Deduplicate and freeze
  middlewareCache[wireType][uid] = freezeDedupe(
    resolved
  ) as readonly CorePikkuMiddleware[]

  return middlewareCache[wireType][uid]
}
