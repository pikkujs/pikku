import { UserSessionService } from './services/user-session-service.js'
import {
  CoreSingletonServices,
  PikkuInteraction,
  CorePikkuMiddleware,
} from './types/core.types.js'
import { pikkuState } from './pikku-state.js'

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
  middlewares: Middleware[],
  main?: () => Promise<unknown>
): Promise<unknown> => {
  // Deduplicate middleware using Set to avoid running the same middleware multiple times
  const uniqueMiddleware = Array.from(new Set(middlewares))
  let result: any
  const dispatch = async (index: number): Promise<any> => {
    if (uniqueMiddleware && index < uniqueMiddleware.length) {
      return await uniqueMiddleware[index]!(services as any, interaction, () =>
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
  tag: string,
  middleware: PikkuMiddleware[]
) => {
  const middlewareStore = pikkuState('misc', 'middleware')

  // Check if tag already exists
  if (middlewareStore[tag]) {
    throw new Error(
      `Middleware for tag '${tag}' already exists. Use a different tag or remove the existing middleware first.`
    )
  }

  middlewareStore[tag] = middleware as CorePikkuMiddleware[]
}

/**
 * Retrieves middleware for a given set of tags.
 *
 * This function looks up all middleware registered for any of the provided tags
 * and returns them as a flattened array.
 *
 * @param {string[]} tags - Array of tags to look up middleware for.
 * @returns {CorePikkuMiddleware[]} Array of middleware functions that apply to the given tags.
 *
 * @example
 * ```typescript
 * // Get all middleware for tags 'api' and 'auth'
 * const middleware = getMiddlewareForTags(['api', 'auth'])
 * ```
 */
export const getMiddlewareForTags = (
  tags?: string[]
): CorePikkuMiddleware[] => {
  if (!tags || tags.length === 0) {
    return []
  }

  const middlewareStore = pikkuState('misc', 'middleware')
  const applicableMiddleware: CorePikkuMiddleware[] = []

  // Collect middleware for all matching tags
  for (const tag of tags) {
    const tagMiddleware = middlewareStore[tag]
    if (tagMiddleware) {
      applicableMiddleware.push(...tagMiddleware)
    }
  }

  return applicableMiddleware
}

/**
 * Combines tag-based middleware with wiring-specific middleware and function-level middleware.
 *
 * This helper function gets middleware for tags and combines it with any
 * wiring-specific middleware and function-level middleware, avoiding the need for manual spreading.
 *
 * @param {object} options - Configuration object for combining middleware.
 * @param {CorePikkuMiddleware[] | undefined} options.wiringMiddleware - Wiring-specific middleware.
 * @param {string[] | undefined} options.wiringTags - Array of wiring-level tags to look up middleware for.
 * @param {CorePikkuMiddleware[] | undefined} options.funcMiddleware - Function-level middleware.
 * @param {string[] | undefined} options.funcTags - Array of function-level tags to look up middleware for.
 * @returns {CorePikkuMiddleware[]} Combined array of tag-based and wiring-specific middleware.
 *
 * @example
 * ```typescript
 * const combined = combineMiddleware({
 *   wiringMiddleware: httpRoute.middleware,
 *   wiringTags: httpRoute.tags,
 *   funcMiddleware: funcConfig.middleware,
 *   funcTags: funcConfig.tags
 * })
 * ```
 */
export const combineMiddleware = ({
  wiringMiddleware,
  wiringTags,
  funcMiddleware,
  funcTags,
}: {
  wiringMiddleware?: CorePikkuMiddleware[]
  wiringTags?: string[]
  funcMiddleware?: CorePikkuMiddleware[]
  funcTags?: string[]
} = {}): CorePikkuMiddleware[] => {
  // Run middleware in specific order:
  // 1) wiringTags middleware
  // 2) wiringMiddleware
  // 3) funcMiddleware
  // 4) funcTags middleware
  const wiringTaggedMiddleware = getMiddlewareForTags(wiringTags)
  const funcTaggedMiddleware = getMiddlewareForTags(funcTags)

  return [
    ...wiringTaggedMiddleware,
    ...(wiringMiddleware || []),
    ...(funcMiddleware || []),
    ...funcTaggedMiddleware,
  ]
}
