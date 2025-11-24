/**
 * Generates type definitions for HTTP wirings
 */
export const serializeHTTPTypes = (
  functionTypesImportPath: string,
  packageName?: string
) => {
  const packageNameValue = packageName ? `'${packageName}'` : 'undefined'

  return `/**
 * HTTP-specific type definitions for tree-shaking optimization
 */

import { AssertHTTPWiringParams, wireHTTP as wireHTTPCore, addHTTPMiddleware as addHTTPMiddlewareCore, addHTTPPermission as addHTTPPermissionCore } from '@pikku/core/http'
import type { PikkuFunction, PikkuFunctionSessionless, PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'
import type { CoreHTTPFunctionWiring } from '@pikku/core/http'

/**
 * Type definition for HTTP API wirings with type-safe path parameters.
 * Supports both authenticated and unauthenticated functions.
 *
 * @template In - Input type for the HTTP wiring
 * @template Out - Output type for the HTTP wiring
 * @template Route - String literal type for the HTTP path (e.g., "/users/:id")
 */
type HTTPWiring<In, Out, Route extends string> = CoreHTTPFunctionWiring<In, Out, Route, PikkuFunction<In, Out, 'rpc' | 'session'>, PikkuFunctionSessionless<In, Out, 'rpc' | 'session'>, PikkuPermission<In>, PikkuMiddleware>

/**
 * Registers an HTTP wiring with the Pikku framework.
 *
 * @template In - Input type for the HTTP wiring
 * @template Out - Output type for the HTTP wiring
 * @template Route - String literal type for the HTTP path (e.g., "/users/:id")
 * @param httpWiring - HTTP wiring definition with handler, method, and optional middleware
 */
export const wireHTTP = <In, Out, Route extends string>(
  httpWiring: HTTPWiring<In, Out, Route> & AssertHTTPWiringParams<In, Route>
) => {
  wireHTTPCore({ ...httpWiring, packageName: ${packageNameValue} } as any)
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
  addHTTPMiddlewareCore(routeOrMiddleware as any, middleware as any, ${packageNameValue})
}

/**
 * Registers HTTP permissions either globally or for a specific route pattern.
 *
 * When a string route pattern is provided along with permissions, the permissions
 * are applied only to that route. Permissions can be passed as an array or as a
 * permission group object.
 *
 * @param pattern - Route pattern string (e.g., '*' for all routes, '/api/*' for specific routes)
 * @param permissions - The permissions to apply for the specified route pattern
 *
 * @example
 * \`\`\`typescript
 * // Add global HTTP permissions
 * addHTTPPermission('*', { global: globalPermission })
 *
 * // Add route-specific permissions
 * addHTTPPermission('/api/admin/*', { admin: adminPermission })
 * \`\`\`
 */
export const addHTTPPermission = <In = unknown>(
  pattern: string,
  permissions: Record<string, PikkuPermission<In>> | PikkuPermission<In>[]
) => {
  addHTTPPermissionCore(pattern, permissions as any, ${packageNameValue})
}
`
}
