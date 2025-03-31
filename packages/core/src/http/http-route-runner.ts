import { verifyPermissions } from '../permissions.js'
import {
  CoreHTTPFunctionRoute,
  RunRouteOptions,
  RunRouteParams,
  PikkuHTTP,
} from './http-routes.types.js'
import { PikkuMiddleware, SessionServices } from '../types/core.types.js'
import { match } from 'path-to-regexp'
import {
  ForbiddenError,
  MissingSessionError,
  NotFoundError,
} from '../errors/errors.js'
import { closeSessionServices } from '../utils.js'
import { PikkuRequest } from '../pikku-request.js'
import { PikkuResponse } from '../pikku-response.js'
import { coerceQueryStringToArray, validateSchema } from '../schema.js'
import { PikkuUserSessionService } from '../services/user-session-service.js'
import { runMiddleware } from '../middleware-runner.js'
import { handleError } from '../handle-error.js'
import { pikkuState } from '../pikku-state.js'
import { PikkuHTTPResponse } from './pikku-http-response.js'
import { PikkuHTTPRequest } from './pikku-http-request.js'

/**
 * Add middleware to a specific route or globally
 *
 * @param {APIMiddleware[] | string} routeOrMiddleware - Route pattern to match or middleware array
 * @param {APIMiddleware} [middleware] - Middleware to add (required if first param is a string)
 */
export const addMiddleware = <APIMiddleware extends PikkuMiddleware>(
  routeOrMiddleware: APIMiddleware[] | string,
  middleware?: APIMiddleware[]
) => {
  if (typeof routeOrMiddleware === 'string' && middleware) {
    pikkuState('http', 'middleware').push({
      route: routeOrMiddleware,
      middleware,
    })
  } else {
    pikkuState('http', 'middleware').push({
      route: '*',
      middleware: routeOrMiddleware as any,
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
  pikkuState('http', 'routes').push(route as any)
}

/**
 * Find a route that matches the given request type and path
 *
 * @param {string} requestType - HTTP method (GET, POST, etc.)
 * @param {string} requestPath - URL path to match
 * @returns {Object | undefined} Matching route information or undefined if no match
 */
const getMatchingRoute = (requestType: string, requestPath: string) => {
  const routes = pikkuState('http', 'routes')
  const middleware = pikkuState('http', 'middleware')
  const routesMeta = pikkuState('http', 'meta')

  for (const route of routes) {
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
      const globalMiddleware = middleware
        .filter((m) => m.route === '*' || new RegExp(m.route).test(route.route))
        .map((m) => m.middleware)
        .flat()

      // Find schema for this route
      const schemaName = routesMeta.find(
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
    request instanceof PikkuHTTPRequest ||
    response instanceof PikkuHTTPResponse
  ) {
    http = {}
    if (request instanceof PikkuHTTPRequest) {
      http.request = request
    }
    if (response instanceof PikkuHTTPResponse) {
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
    context: Map<string, unknown>
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
    context,
    createSessionServices,
    skipUserSession,
  } = services

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
      { ...singletonServices, userSessionService, context },
      { http },
      session
    )

    const allServices = {
      ...singletonServices,
      ...sessionServices,
      http,
      context,
    }
    const data = await http?.request?.getData()

    // Validate schema
    validateSchema(
      singletonServices.logger,
      singletonServices.schemaService,
      schemaName,
      data
    )

    if (options.coerceToArray && schemaName) {
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
      http?.response?.arrayBuffer(result)
    } else {
      http?.response?.json(result)
    }

    http?.response?.status(200)
    // TODO
    //http?.response?.end()

    return result
  }

  await runMiddleware(
    { ...singletonServices, context, userSessionService },
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
export const runHTTPRoute = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  params: RunRouteOptions & RunRouteParams
): Promise<Response> => {
  const pikkuResponse = new PikkuHTTPResponse()
  await runHTTPRouteWithoutResponse<In, Out>(request, {
    ...params,
    response: pikkuResponse,
  })
  return pikkuResponse.toResponse()
}

/**
 * Run an HTTP route with the given parameters
 *
 * @param {Object} options - Options for running the route
 * @returns {Promise<Out | void>} Result of the route handler
 * @ignore
 */
export const runHTTPRouteWithoutResponse = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  {
    singletonServices,
    response,
    createSessionServices,
    skipUserSession = false,
    respondWith404 = true,
    logWarningsForStatusCodes = [],
    coerceToArray = false,
    bubbleErrors = false,
  }: RunRouteOptions & RunRouteParams
): Promise<Out | void> => {
  const context = new Map()

  const userSessionService = new PikkuUserSessionService()
  let sessionServices: SessionServices<typeof singletonServices> | undefined
  let result: Out

  // Create HTTP interaction object
  const http = createHTTPInteraction(
    request instanceof Request ? new PikkuHTTPRequest(request) : request,
    response
  )
  const apiType = http!.request!.method()
  const apiRoute = http!.request!.path()

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
        context,
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
      context.get('trackingId'),
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
