/**
 * Generates type definitions for HTTP wirings
 */
export const serializeHTTPTypes = (functionTypesImportPath: string) => {
  return `/**
 * HTTP-specific type definitions for tree-shaking optimization
 */

import { AssertHTTPWiringParams, wireHTTP as wireHTTPCore, addHTTPMiddleware as addHTTPMiddlewareCore, addHTTPPermission as addHTTPPermissionCore, wireHTTPRoutes as wireHTTPRoutesCore, defineHTTPRoutes as defineHTTPRoutesCore } from '@pikku/core/http'
import type { PikkuFunction, PikkuFunctionSessionless, PikkuPermission, PikkuMiddleware, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { CoreHTTPFunctionWiring, HTTPMethod, HTTPRouteBaseConfig } from '@pikku/core/http'

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
 * HTTP wiring for workflow triggers (no function needed)
 */
type HTTPWorkflowWiring<Route extends string> = {
  route: Route
  method: HTTPMethod
  workflow: true
  func?: undefined
  permissions?: undefined
  auth?: undefined
  tags?: undefined
  middleware?: undefined
  returnsJSON?: undefined
  sse?: boolean
}

/**
 * Registers an HTTP wiring with the Pikku framework.
 *
 * @template In - Input type for the HTTP wiring
 * @template Out - Output type for the HTTP wiring
 * @template Route - String literal type for the HTTP path (e.g., "/users/:id")
 * @param httpWiring - HTTP wiring definition with handler, method, and optional middleware
 */
export const wireHTTP = <In, Out, Route extends string>(
  httpWiring: (HTTPWiring<In, Out, Route> & AssertHTTPWiringParams<In, Route>) | HTTPWorkflowWiring<Route>
) => {
  wireHTTPCore(httpWiring as any)
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
  addHTTPPermissionCore(pattern, permissions as any)
}

/**
 * Route configuration for wireHTTPRoutes with proper typing
 */
type HTTPRouteConfig = HTTPRouteBaseConfig & {
  method: HTTPMethod
  route: string
  func: PikkuFunctionConfig<any, any, any, any, any, any>
  auth?: boolean
  permissions?: Record<string, PikkuPermission | PikkuPermission[]>
  middleware?: PikkuMiddleware[]
  sse?: boolean
}

/**
 * Typed route map for wireHTTPRoutes
 */
type TypedHTTPRouteMap = {
  [key: string]: HTTPRouteConfig | TypedHTTPRouteMap | TypedHTTPRouteContract
}

/**
 * Typed route contract for defineHTTPRoutes
 */
type TypedHTTPRouteContract<T extends TypedHTTPRouteMap = TypedHTTPRouteMap> = TypedHTTPRoutesGroupConfig & {
  routes: T
}

/**
 * Group config with typed middleware/permissions
 */
type TypedHTTPRoutesGroupConfig = {
  basePath?: string
  tags?: string[]
  auth?: boolean
  middleware?: PikkuMiddleware[]
  permissions?: Record<string, PikkuPermission | PikkuPermission[]>
}

/**
 * Full config for wireHTTPRoutes
 */
type TypedWireHTTPRoutesConfig = TypedHTTPRoutesGroupConfig & {
  routes: TypedHTTPRouteMap | HTTPRouteConfig[]
}

/**
 * Type-safe helper for defining route contracts that can be composed.
 */
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(routes: T): TypedHTTPRouteContract<T>
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(config: TypedHTTPRoutesGroupConfig & { routes: T }): TypedHTTPRouteContract<T>
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(configOrRoutes: T | (TypedHTTPRoutesGroupConfig & { routes: T })): TypedHTTPRouteContract<T> {
  return defineHTTPRoutesCore(configOrRoutes as any) as unknown as TypedHTTPRouteContract<T>
}

/**
 * Wires multiple HTTP routes from a nested map or array configuration.
 */
export const wireHTTPRoutes = (config: TypedWireHTTPRoutesConfig): void => {
  wireHTTPRoutesCore(config as any)
}
`
}
