/**
 * Generates type definitions for HTTP wirings
 */
export const serializeHTTPTypes = (
  functionTypesImportPath: string,
  middlewareTypesImportPath: string,
  authTypesImportPath: string,
  { addon = false }: { addon?: boolean } = {}
) => {
  return `/**
 * HTTP-specific type definitions for tree-shaking optimization
 */

import { ${addon ? '' : 'wireHTTP as wireHTTPCore, '}${addon ? '' : 'wireHTTPRoutes as wireHTTPRoutesCore, '}defineHTTPRoutes as defineHTTPRoutesCore } from '@pikku/core/http'
${addon ? '' : `import { AssertHTTPWiringParams } from '@pikku/core/http'\n`}import type { ${addon ? '' : 'PikkuFunction, PikkuFunctionSessionless, '}PikkuFunctionConfig } from '${functionTypesImportPath}'
${addon ? '' : `import type { PikkuPermission } from '${authTypesImportPath}'\n`}import type { PikkuMiddleware } from '${middlewareTypesImportPath}'
import type {
${addon ? '' : '  CoreHTTPFunctionWiring,\n'}  HTTPMethod,
  HTTPRouteBaseConfig,
} from '@pikku/core/http'

${
  addon
    ? ''
    : `/**
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
 *
 * @example snippet: httpSingleRoute
 */
export const wireHTTP = <In, Out, Route extends string>(
  httpWiring: HTTPWiring<In, Out, Route> & AssertHTTPWiringParams<In, Route>
) => {
  wireHTTPCore(httpWiring as any)
}
`
}
/**
 * Route configuration for wireHTTPRoutes with proper typing
 */
type HTTPRouteConfig = HTTPRouteBaseConfig & {
  method: HTTPMethod
  route: string
  func: PikkuFunctionConfig<any, any, any, any, any, any>
  auth?: boolean
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
 * Group config with typed middleware
 */
type TypedHTTPRoutesGroupConfig = {
  basePath?: string
  tags?: string[]
  auth?: boolean
  middleware?: PikkuMiddleware[]
}

${
  addon
    ? ''
    : `/**
 * Full config for wireHTTPRoutes
 */
type TypedWireHTTPRoutesConfig = TypedHTTPRoutesGroupConfig & {
  routes: TypedHTTPRouteMap | HTTPRouteConfig[]
}
`
}
/**
 * Type-safe helper for defining route contracts that can be composed.
 *
 * @example snippet: wireHttp
 */
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(routes: T): TypedHTTPRouteContract<T>
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(config: TypedHTTPRoutesGroupConfig & { routes: T }): TypedHTTPRouteContract<T>
export function defineHTTPRoutes<T extends TypedHTTPRouteMap>(configOrRoutes: T | (TypedHTTPRoutesGroupConfig & { routes: T })): TypedHTTPRouteContract<T> {
  return defineHTTPRoutesCore(configOrRoutes as any) as unknown as TypedHTTPRouteContract<T>
}

${
  addon
    ? ''
    : `
/**
 * Wires multiple HTTP routes from a nested map or array configuration.
 *
 * @example snippet: httpRoutesWiring
 */
export const wireHTTPRoutes = (config: TypedWireHTTPRoutesConfig): void => {
  wireHTTPRoutesCore(config as any)
}
`
}`
}
