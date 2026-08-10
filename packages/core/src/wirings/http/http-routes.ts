import type {
  CoreHTTPFunctionWiring,
  HTTPRouteConfig,
  HTTPRouteMap,
  HTTPRouteContract,
  HTTPRoutesGroupConfig,
  WireHTTPRoutesConfig,
} from './http.types.js'
import { wireHTTP } from './http-runner.js'

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
