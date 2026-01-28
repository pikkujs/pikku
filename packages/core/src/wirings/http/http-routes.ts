import type {
  HTTPRouteConfig,
  HTTPRouteMap,
  HTTPRouteContract,
  HTTPRoutesGroupConfig,
  WireHTTPRoutesConfig,
} from './http.types.js'
import { wireHTTP } from './http-runner.js'

/**
 * Type-safe helper for defining route contracts that can be composed.
 * Supports optional group-level config that cascades to all routes.
 *
 * @example
 * ```typescript
 * // Simple routes without group config
 * export const todosRoutes = defineHTTPRoutes({
 *   list: { method: 'get', route: '/todos', func: listTodos },
 *   get: { method: 'get', route: '/todos/:id', func: getTodo },
 * })
 *
 * // Routes with group-level config
 * export const todosRoutes = defineHTTPRoutes({
 *   auth: true,
 *   tags: ['todos'],
 *   routes: {
 *     list: { method: 'get', route: '/todos', func: listTodos },
 *     get: { method: 'get', route: '/todos/:id', func: getTodo },
 *   }
 * })
 * ```
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
  // If it has a 'routes' property and contains a map (not a route config), it's config + routes
  if (
    'routes' in configOrRoutes &&
    typeof configOrRoutes.routes === 'object' &&
    !isRouteConfig(configOrRoutes.routes)
  ) {
    return configOrRoutes as HTTPRouteContract<T>
  }
  // Otherwise it's just routes
  return { routes: configOrRoutes as T }
}

/**
 * Wires multiple HTTP routes from a nested map or array configuration.
 * Inspired by ts-rest's contract pattern, provides a single place to wire an entire API.
 *
 * @example
 * ```typescript
 * // Nested object format
 * wireHTTPRoutes({
 *   basePath: '/api/v1',
 *   tags: ['api'],
 *   routes: {
 *     todos: {
 *       list: { method: 'get', route: '/todos', func: listTodos },
 *       get: { method: 'get', route: '/todos/:id', func: getTodo },
 *     },
 *     auth: {
 *       login: { method: 'post', route: '/auth/login', func: login, auth: false },
 *     },
 *   },
 * })
 *
 * // Flat array format
 * wireHTTPRoutes({
 *   basePath: '/api',
 *   routes: [
 *     { method: 'get', route: '/todos', func: listTodos },
 *     { method: 'post', route: '/todos', func: createTodo },
 *   ],
 * })
 *
 * // Composing route contracts
 * wireHTTPRoutes({
 *   basePath: '/api/v1',
 *   routes: {
 *     todos: todosRoutes,  // from defineHTTPRoutes()
 *     auth: authRoutes,    // from defineHTTPRoutes()
 *   },
 * })
 * ```
 */
export const wireHTTPRoutes = (config: WireHTTPRoutesConfig): void => {
  const { routes, ...groupConfig } = config

  if (Array.isArray(routes)) {
    routes.forEach((route) => registerRoute(route, groupConfig))
  } else {
    processRouteMap(routes, groupConfig)
  }
}

/**
 * Recursively processes a route map, handling nested maps and contracts
 */
function processRouteMap(
  map: HTTPRouteMap,
  parentConfig: HTTPRoutesGroupConfig
): void {
  for (const [_key, value] of Object.entries(map)) {
    if (isRouteConfig(value)) {
      registerRoute(value, parentConfig)
    } else if (isRouteContract(value)) {
      // Merge parent config with contract config, then process routes
      const mergedConfig = mergeGroupConfig(parentConfig, value)
      processRouteMap(value.routes, mergedConfig)
    } else {
      // Nested map without config
      processRouteMap(value as HTTPRouteMap, parentConfig)
    }
  }
}

/**
 * Merge group configs with proper cascading behavior:
 * - basePath: Concatenates
 * - tags: Merges (parent + child)
 * - middleware: Merges (parent runs first)
 * - auth: Inner overrides outer
 * - permissions: Inner overrides outer
 */
function mergeGroupConfig(
  parent: HTTPRoutesGroupConfig,
  child: HTTPRoutesGroupConfig
): HTTPRoutesGroupConfig {
  return {
    basePath: (parent.basePath || '') + (child.basePath || ''),
    tags: [...(parent.tags || []), ...(child.tags || [])],
    middleware: [...(parent.middleware || []), ...(child.middleware || [])],
    auth: child.auth ?? parent.auth,
    permissions: child.permissions ?? parent.permissions,
  }
}

/**
 * Registers a single route by calling wireHTTP with merged configuration
 */
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
    permissions: route.permissions ?? groupConfig.permissions,
    contentType: route.contentType,
    timeout: route.timeout,
    headers: route.headers,
    docs: route.docs,
    sse: route.sse,
  } as any)
}

/**
 * Type guard to check if a value is an individual route config
 */
function isRouteConfig(value: unknown): value is HTTPRouteConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'func' in value &&
    'route' in value
  )
}

/**
 * Type guard to check if a value is a route contract (has routes property but is not a route config)
 */
function isRouteContract(value: unknown): value is HTTPRouteContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'routes' in value &&
    !('method' in value) &&
    !('func' in value)
  )
}
