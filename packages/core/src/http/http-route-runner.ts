import { verifyPermissions } from '../permissions.js'
import {
  CoreHTTPFunctionRoute,
  HTTPRoutesMeta,
  RunRouteOptions,
  RunRouteParams,
  PikkuHTTP,
  HTTPRouteMiddleware,
} from './http-routes.types.js'
import { SessionServices } from '../types/core.types.js'
import { match } from 'path-to-regexp'
import { PikkuHTTPAbstractRequest } from './pikku-http-abstract-request.js'
import { PikkuHTTPAbstractResponse } from './pikku-http-abstract-response.js'
import {
  ForbiddenError,
  MissingSessionError,
  NotFoundError,
} from '../errors/errors.js'
import crypto from 'crypto'
import { closeSessionServices } from '../utils.js'
import { PikkuRequest } from '../pikku-request.js'
import { PikkuResponse } from '../pikku-response.js'
import { coerceQueryStringToArray, validateSchema } from '../schema.js'
import { LocalUserSessionService } from '../services/user-session-service.js'
import { runMiddleware } from '../middleware-runner.js'
import { handleError } from '../handle-error.js'

/**
 * Initialize global state for HTTP routes and middleware if not already available
 */
if (!globalThis.pikku?.httpRoutes) {
  globalThis.pikku = globalThis.pikku || {}
  globalThis.pikku.httpMiddleware = []
  globalThis.pikku.httpRoutes = []
  globalThis.pikku.httpRoutesMeta = []
}

/**
 * Get or set the global HTTP routes
 *
 * @param {CoreHTTPFunctionRoute<any, any, any>[]} [data] - Optional routes data to set
 * @returns {CoreHTTPFunctionRoute<any, any, any>[]} Current routes
 */
const httpRoutes = (
  data?: CoreHTTPFunctionRoute<any, any, any>[]
): CoreHTTPFunctionRoute<any, any, any>[] => {
  if (data) {
    globalThis.pikku.httpRoutes = data
  }
  return globalThis.pikku.httpRoutes
}

/**
 * Get or set the global HTTP route metadata
 *
 * @param {HTTPRoutesMeta} [data] - Optional route metadata to set
 * @returns {HTTPRoutesMeta} Current route metadata
 */
const httpRoutesMeta = (data?: HTTPRoutesMeta): HTTPRoutesMeta => {
  if (data) {
    globalThis.pikku.httpRoutesMeta = data
  }
  return globalThis.pikku.httpRoutesMeta
}

/**
 * Get or set the global HTTP middleware
 *
 * @param {HTTPRouteMiddleware[]} [data] - Optional middleware to set
 * @returns {HTTPRouteMiddleware[]} Current middleware
 */
const httpMiddleware = (
  data?: HTTPRouteMiddleware[]
): HTTPRouteMiddleware[] => {
  if (data) {
    globalThis.pikku.httpMiddleware = data
  }
  return globalThis.pikku.httpMiddleware
}

/**
 * Add middleware to a specific route or globally
 *
 * @param {APIMiddleware[] | string} routeOrMiddleware - Route pattern to match or middleware array
 * @param {APIMiddleware} [middleware] - Middleware to add (required if first param is a string)
 */
export const addMiddleware = <APIMiddleware>(
  routeOrMiddleware: APIMiddleware[] | string,
  middleware?: APIMiddleware[]
) => {
  if (typeof routeOrMiddleware === 'string') {
    globalThis.pikku.httpMiddleware.push({
      route: routeOrMiddleware,
      middleware: middleware!,
    })
  } else {
    globalThis.pikku.httpMiddleware.push({
      route: '*',
      middleware: routeOrMiddleware,
    })
  }
}

/**
 * Add a route to the global routes registry
 *
 * @param {CoreHTTPFunctionRoute} route - Route configuration to add
 */
export const addRoute = <
  In,
  Out,
  Route extends string,
  APIFunction,
  APIFunctionSessionless,
  APIPermission,
  APIMiddleware,
>(
  route: CoreHTTPFunctionRoute<
    In,
    Out,
    Route,
    APIFunction,
    APIFunctionSessionless,
    APIPermission,
    APIMiddleware
  >
) => {
  httpRoutes().push(route as any)
}

/**
 * Remove all routes from the global registry
 */
export const clearRoutes = () => {
  httpRoutes([])
}

/**
 * Set the HTTP routes metadata
 *
 * @param {HTTPRoutesMeta} routeMeta - Metadata for routes
 * @ignore
 */
export const setHTTPRoutesMeta = (routeMeta: HTTPRoutesMeta) => {
  httpRoutesMeta(routeMeta)
}

/**
 * Returns all the registered routes and associated metadata
 *
 * @returns {Object} Object containing routes and routesMeta
 * @internal
 */
export const getRoutes = () => {
  return {
    routes: httpRoutes(),
    routesMeta: httpRoutesMeta(),
  }
}

/**
 * Find a route that matches the given request type and path
 *
 * @param {string} requestType - HTTP method (GET, POST, etc.)
 * @param {string} requestPath - URL path to match
 * @returns {Object | undefined} Matching route information or undefined if no match
 */
const getMatchingRoute = (requestType: string, requestPath: string) => {
  for (const route of httpRoutes()) {
    // Skip routes that don't match the request method
    if (route.method !== requestType.toLowerCase()) {
      continue
    }

    // Create path matcher function
    const matchFunc = match(`/${route.route}`.replace(/^\/\//, '/'), {
      decode: decodeURIComponent,
    })

    // Try to match the path
    const matchedPath = matchFunc(requestPath.replace(/^\/\//, '/'))

    if (matchedPath) {
      // Get all middleware for this route
      const globalMiddleware = httpMiddleware()
        .filter((m) => m.route === '*' || new RegExp(m.route).test(route.route))
        .map((m) => m.middleware)
        .flat()

      // Find schema for this route
      const schemaName = httpRoutesMeta().find(
        (routeMeta) =>
          routeMeta.method === route.method && routeMeta.route === route.route
      )?.input

      return {
        matchedPath,
        params: matchedPath.params,
        route,
        middleware: [...globalMiddleware, ...(route.middleware || [])],
        schemaName,
      }
    }
  }
  return undefined
}

/**
 * Create an HTTP interaction object from request and response
 *
 * @param {PikkuRequest | undefined} request - The HTTP request object
 * @param {PikkuResponse | undefined} response - The HTTP response object
 * @returns {PikkuHTTP | undefined} HTTP interaction object or undefined
 */
export const createHTTPInteraction = (
  request: PikkuRequest | undefined,
  response: PikkuResponse | undefined
): PikkuHTTP | undefined => {
  let http: PikkuHTTP | undefined = undefined

  if (
    request instanceof PikkuHTTPAbstractRequest ||
    response instanceof PikkuHTTPAbstractResponse
  ) {
    http = {}
    if (request instanceof PikkuHTTPAbstractRequest) {
      http.request = request
    }
    if (response instanceof PikkuHTTPAbstractResponse) {
      http.response = response
    }
  }

  return http
}

/**
 * Validate input data and execute route handler with appropriate middleware
 *
 * @param {Object} services - Available services
 * @param {Object} matchedRoute - Information about the matched route
 * @param {PikkuHTTP | undefined} http - HTTP interaction object
 * @param {Object} options - Additional options
 * @returns {Promise<any>} Result of the route handler
 */
const executeRouteWithMiddleware = async (
  services: {
    singletonServices: any
    userSessionService: any
    createSessionServices: Function
    skipUserSession: boolean
  },
  matchedRoute: {
    matchedPath: any
    params: any
    route: CoreHTTPFunctionRoute<any, any, any>
    middleware: any[]
    schemaName?: string | null
  },
  http: PikkuHTTP | undefined,
  options: {
    coerceToArray: boolean
  }
) => {
  const { matchedPath, params, route, middleware, schemaName } = matchedRoute
  const {
    singletonServices,
    userSessionService,
    createSessionServices,
    skipUserSession,
  } = services
  const { coerceToArray } = options

  const requiresSession = route.auth !== false
  let sessionServices: any
  let result: any

  http?.request?.setParams(params)

  singletonServices.logger.info(
    `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
  )

  // Main route execution function
  const runMain = async () => {
    const session = userSessionService.get()

    // Validate session was set if needed
    if (skipUserSession && requiresSession) {
      throw new Error(
        "Can't skip trying to get user session if auth is required"
      )
    }

    if (requiresSession && !session) {
      singletonServices.logger.info({
        action: 'Rejecting route (invalid session)',
        path: matchedPath,
      })
      throw new MissingSessionError()
    }

    // Create session services
    sessionServices = await createSessionServices(
      singletonServices,
      { http },
      session
    )

    const allServices = { ...singletonServices, ...sessionServices, http }
    const data = await http?.request?.getData()

    // Validate schema
    validateSchema(
      singletonServices.logger,
      singletonServices.schemaService,
      schemaName,
      data
    )

    if (coerceToArray && schemaName) {
      coerceQueryStringToArray(schemaName, data)
    }

    // Run permission checks
    const permissioned = await verifyPermissions(
      route.permissions,
      allServices,
      data,
      session
    )

    if (permissioned === false) {
      throw new ForbiddenError('Permission denied')
    }

    // Execute the route handler
    result = await route.func(allServices, data, session!)

    // Set the response
    if (route.returnsJSON === false) {
      http?.response?.setResponse(result)
    } else {
      http?.response?.setJson(result)
    }

    http?.response?.setStatus(200)
    http?.response?.end()

    return result
  }

  await runMiddleware(
    { ...singletonServices, userSessionService },
    { http },
    middleware,
    runMain
  )

  return sessionServices ? { result, sessionServices } : { result }
}

/**
 * Run an HTTP route with the given parameters
 *
 * @param {Object} options - Options for running the route
 * @returns {Promise<Out | void>} Result of the route handler
 * @ignore
 */
export const runHTTPRoute = async <In, Out>({
  singletonServices,
  request,
  response,
  createSessionServices,
  route: apiRoute,
  method: apiType,
  skipUserSession = false,
  respondWith404 = true,
  logWarningsForStatusCodes = [],
  coerceToArray = false,
  bubbleErrors = false,
}: Pick<CoreHTTPFunctionRoute<unknown, unknown, any>, 'route' | 'method'> &
  RunRouteOptions &
  RunRouteParams<In>): Promise<Out | void> => {
  const trackerId: string = crypto.randomUUID().toString()

  const userSessionService = new LocalUserSessionService()
  let sessionServices: SessionServices<typeof singletonServices> | undefined
  let result: Out

  // Create HTTP interaction object
  const http = createHTTPInteraction(request, response)

  // Find matching route
  const matchedRoute = getMatchingRoute(apiType, apiRoute)

  try {
    // Handle route not found
    if (!matchedRoute) {
      singletonServices.logger.info({
        message: 'Route not found',
        apiRoute,
        apiType,
      })
      throw new NotFoundError(`Route not found: ${apiRoute}`)
    }

    // Execute route with middleware
    ;({ result, sessionServices } = await executeRouteWithMiddleware(
      {
        singletonServices,
        userSessionService,
        createSessionServices,
        skipUserSession,
      },
      matchedRoute,
      http,
      { coerceToArray }
    ))

    return result
  } catch (e: any) {
    // Handle and possibly bubble the error
    handleError(
      e,
      http,
      trackerId,
      singletonServices.logger,
      logWarningsForStatusCodes,
      respondWith404,
      bubbleErrors
    )
  } finally {
    // Clean up session services
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}
