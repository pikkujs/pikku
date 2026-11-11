import type {
  CoreHTTPFunctionWiring,
  HTTPRouteConfig,
  HTTPRouteMap,
  HTTPRouteContract,
  HTTPRoutesGroupConfig,
  WireHTTPRoutesConfig,
} from './http.types.js'
import { wireHTTP } from './http-runner.js'

/**
 * Declares a group of HTTP routes without wiring them, so the group can be composed and typed as a contract.
 *
 * Accepts either a bare route map or a config with `basePath`, `auth`, `tags`
 * and `middleware` that apply to every route in it. Nested groups concatenate
 * `basePath`s, tags and middleware; a route's own `auth` wins over the group's.
 * Pass the result to {@link wireHTTPRoutes} to register it.
 *
 * @example snippet: wireHttp
 */
export function defineHTTPRoutes<T extends HTTPRouteMap>(
  routes: T
): HTTPRouteContract<T>
export function defineHTTPRoutes<T extends HTTPRouteMap>(
  config: HTTPRoutesGroupConfig & { routes: T }
): HTTPRouteContract<T>
export function defineHTTPRoutes<T extends HTTPRouteMap>(
  configOrRoutes: T | (HTTPRoutesGroupConfig & { routes: T })
): HTTPRouteContract<T> {
  if (
    'routes' in configOrRoutes &&
    typeof configOrRoutes.routes === 'object' &&
    !isRouteConfig(configOrRoutes.routes)
  ) {
    return configOrRoutes as HTTPRouteContract<T>
  }
  return { routes: configOrRoutes as T }
}

/**
 * Wires a map (or array) of routes and route groups in one call.
 *
 * Each route is registered through {@link wireHTTP} with its group's `basePath`
 * prefixed to its path, the group's middleware run before its own, and the
 * group's `auth` applied when the route sets none.
 *
 * @param config - Group options plus `routes`: a map of routes, groups from {@link defineHTTPRoutes}, or nested maps.
 *
 * @example snippet: httpRoutesWiring
 */
export const wireHTTPRoutes = (config: WireHTTPRoutesConfig): void => {
  const { routes, ...groupConfig } = config

  if (Array.isArray(routes)) {
    routes.forEach((route) => registerRoute(route, groupConfig))
  } else {
    processRouteMap(routes, groupConfig)
  }
}

function processRouteMap(
  map: HTTPRouteMap,
  parentConfig: HTTPRoutesGroupConfig
): void {
  for (const [_key, value] of Object.entries(map)) {
    if (isRouteConfig(value)) {
      registerRoute(value, parentConfig)
    } else if (isRouteContract(value)) {
      const mergedConfig = mergeGroupConfig(parentConfig, value)
      processRouteMap(value.routes, mergedConfig)
    } else {
      processRouteMap(value as HTTPRouteMap, parentConfig)
    }
  }
}

function mergeGroupConfig(
  parent: HTTPRoutesGroupConfig,
  child: HTTPRoutesGroupConfig
): HTTPRoutesGroupConfig {
  return {
    basePath: (parent.basePath || '') + (child.basePath || ''),
    tags: [...(parent.tags || []), ...(child.tags || [])],
    middleware: [...(parent.middleware || []), ...(child.middleware || [])],
    auth: child.auth ?? parent.auth,
  }
}

function registerRoute(
  route: HTTPRouteConfig,
  groupConfig: HTTPRoutesGroupConfig
): void {
  const fullRoute = (groupConfig.basePath || '') + route.route

  wireHTTP({
    method: route.method,
    route: fullRoute,
    func: route.func,
    auth: route.auth ?? groupConfig.auth,
    tags: [...(groupConfig.tags || []), ...(route.tags || [])],
    middleware: [
      ...(groupConfig.middleware || []),
      ...(route.middleware || []),
    ],
    contentType: route.contentType,
    timeout: route.timeout,
    headers: route.headers,
    sse: route.sse,
    streamProtocol: route.streamProtocol,
    // `CoreHTTPFunctionWiring` is discriminated by `method`, and a group builds
    // its routes from a method chosen at runtime — no arm can be narrowed to.
  } as CoreHTTPFunctionWiring<unknown, unknown, string>)
}

function isRouteConfig(value: unknown): value is HTTPRouteConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'func' in value &&
    'route' in value
  )
}

function isRouteContract(value: unknown): value is HTTPRouteContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'routes' in value &&
    !('method' in value) &&
    !('func' in value)
  )
}
