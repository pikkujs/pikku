/**
 * Generates the middleware authoring surface — every way a project declares or
 * registers middleware, whatever wiring it ends up attached to.
 *
 * Middleware is one concept, so it is one leaf. `PikkuMiddleware` is declared
 * here rather than alongside the function types that consume it; those types
 * import it back, which is a type-only edge and carries no runtime cycle.
 */
export const serializeMiddlewareTypes = (
  functionTypesImportPath: string,
  requiredServicesTypeImport: string,
  packageName?: string
) => {
  const packageNameValue = packageName ? `'${packageName}'` : 'null'

  return `/**
 * Middleware type definitions and registration for all wirings
 */

import type { CorePikkuMiddleware, MiddlewarePriority } from '@pikku/core/middleware'
import { addTagMiddleware as addTagMiddlewareCore, addGlobalMiddleware as addGlobalMiddlewareCore, pikkuMiddleware as pikkuMiddlewareCore } from '@pikku/core/middleware'
import { addHTTPMiddleware as addHTTPMiddlewareCore } from '@pikku/core/http'
import {
  CorePikkuChannelMiddleware,
  CorePikkuChannelMiddlewareFactory,
  addChannelMiddleware as addChannelMiddlewareCore,
} from '@pikku/core/channel'
import type { PikkuAgentMiddlewareHooks } from '@pikku/core/agent'
import type { Services, SingletonServices } from '${functionTypesImportPath}'
${requiredServicesTypeImport}

export { cors, authAPIKey, authBearer, authCookie } from '@pikku/core/middleware'
export type { MiddlewarePriority }

/**
 * Derived here rather than imported: nothing outside a generated leaf ever
 * names this intersection, so the function leaf keeps it to itself and the
 * leaves that want it spell it out.
 */
type WiredSingletonServices = RequiredSingletonServices & SingletonServices

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple wirings.
 *
 * @template RequiredServices - The services required for this middleware
 */
export type PikkuMiddleware<RequiredServices extends SingletonServices = WiredSingletonServices> = CorePikkuMiddleware<RequiredServices>

/**
 * Configuration object for creating middleware with metadata
 */
type PikkuMiddlewareConfig<RequiredServices extends SingletonServices = WiredSingletonServices> = {
  /** The middleware function */
  func: PikkuMiddleware<RequiredServices>
  /** Optional human-readable name for the middleware */
  name?: string
  /** Optional description of what the middleware does */
  description?: string
  /** Execution priority. \`highest\` runs first (outermost). Defaults to 'medium'. */
  priority?: MiddlewarePriority
}

/**
 * Factory function for creating middleware with tree-shaking support.
 * Supports both direct function and configuration object syntax.
 *
 * @example
 * \`\`\`typescript
 * // Direct function syntax
 * const middleware = pikkuMiddleware(({ logger }, wires, next) => {
 *   logger.info('Middleware executed')
 *   await next()
 * })
 *
 * // Configuration object syntax with metadata
 * const logMiddleware = pikkuMiddleware({
 *   name: 'Request Logger',
 *   description: 'Logs all incoming requests',
 *   priority: 'high',
 *   func: async ({ logger }, wires, next) => {
 *     logger.info('Request started')
 *     await next()
 *   }
 * })
 * \`\`\`
 */
export const pikkuMiddleware = <RequiredServices extends SingletonServices = WiredSingletonServices>(
  middleware: PikkuMiddleware<RequiredServices> | PikkuMiddlewareConfig<RequiredServices>
): PikkuMiddleware<RequiredServices> => {
  return pikkuMiddlewareCore(middleware)
}

/**
 * Factory function for creating middleware factories
 * Use this when your middleware needs configuration/input parameters
 *
 * @example
 * \`\`\`typescript
 * export const logMiddleware = pikkuMiddlewareFactory<LogOptions>(({
 *   message,
 *   level = 'info'
 * }) => {
 *   return pikkuMiddleware(async ({ logger }, next) => {
 *     logger[level](message)
 *     await next()
 *   })
 * })
 * \`\`\`
 */
export const pikkuMiddlewareFactory = <In = any>(
  factory: (input: In) => PikkuMiddleware
): ((input: In) => PikkuMiddleware) => {
  return factory
}

/**
 * Wire-agnostic global middleware. Runs at the top of every wiring's
 * middleware chain — before wire-, tag-, and function-level entries.
 *
 * Resolution order: global -> wire -> tag -> function.
 *
 * @example
 * addGlobalMiddleware([telemetryMiddleware])
 */
export const addGlobalMiddleware = (middleware: PikkuMiddleware[]) => {
  addGlobalMiddlewareCore(middleware as any, ${packageNameValue})
}

/**
 * Tag-scoped middleware. Applies to any wiring that carries the matching tag.
 *
 * @example
 * addTagMiddleware('admin', [adminMiddleware])
 */
export const addTagMiddleware = (tag: string, middleware: PikkuMiddleware[]) => {
  addTagMiddlewareCore(tag, middleware as any, ${packageNameValue})
}
/**
 * Registers HTTP middleware either globally or for a specific route pattern.
 *
 * When a string route pattern is provided along with middleware, the middleware
 * is applied only to that route. Otherwise, if an array is provided, it is treated
 * as global middleware (applied to all routes).
 *
 * @param routeOrMiddleware - Either a global middleware array or a route pattern string
 * @param middleware - The middleware array to apply when a route pattern is specified
 *
 * @example
 * \`\`\`typescript
 * // Add global HTTP middleware
 * addHTTPMiddleware([authMiddleware, loggingMiddleware])
 *
 * // Add route-specific middleware
 * addHTTPMiddleware('/api/admin/*', [adminAuthMiddleware])
 * \`\`\`
 */
export const addHTTPMiddleware = (
  routeOrMiddleware: PikkuMiddleware[] | string,
  middleware?: PikkuMiddleware[]
) => {
  addHTTPMiddlewareCore(routeOrMiddleware as any, middleware as any)
}

/**
 * The shape of channel middleware — it runs around the connection and its
 * messages rather than around a single request.
 */
export type PikkuChannelMiddleware<RequiredServices extends Services = Services, Event = unknown> = CorePikkuChannelMiddleware<RequiredServices, Event>

/**
 * Declares middleware for a channel — it runs around the connection and its
 * messages rather than around a single request.
 */
export const pikkuChannelMiddleware = <RequiredServices extends Services = Services, Event = unknown>(
  middleware: PikkuChannelMiddleware<RequiredServices, Event>
): PikkuChannelMiddleware<RequiredServices, Event> => {
  return middleware
}

/**
 * Declares channel middleware that takes options, so one definition can be
 * wired several times with different configuration.
 */
export const pikkuChannelMiddlewareFactory = <In = any>(
  factory: CorePikkuChannelMiddlewareFactory<In>
): CorePikkuChannelMiddlewareFactory<In> => {
  return factory
}

/**
 * Attaches channel middleware to every channel carrying the given tag, so the
 * channels themselves stay free of the wiring.
 */
export const addChannelMiddleware = (tag: string, middleware: PikkuChannelMiddleware[]) =>
  addChannelMiddlewareCore(tag, middleware, ${packageNameValue})

/**
 * Declares middleware for an agent run — hooks around the model call, its tool
 * calls and the run's state.
 */
export const pikkuAgentMiddleware = <
  State extends Record<string, unknown> = Record<string, unknown>,
  RequiredServices extends SingletonServices = WiredSingletonServices,
>(
  hooks: PikkuAgentMiddlewareHooks<State, RequiredServices>
): PikkuAgentMiddlewareHooks<State, RequiredServices> => hooks
`
}
