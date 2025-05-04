import { verifyPermissions } from '../permissions.js'
import {
  CoreHTTPFunctionRoute,
  RunRouteOptions,
  RunRouteParams,
  PikkuHTTP,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
} from './http-routes.types.js'
import {
  CoreUserSession,
  PikkuMiddleware,
  SessionServices,
} from '../types/core.types.js'
import { match } from 'path-to-regexp'
import {
  ForbiddenError,
  MissingSessionError,
  NotFoundError,
} from '../errors/errors.js'
import { closeSessionServices, createWeakUID } from '../utils.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  PikkuUserSessionService,
  UserSessionService,
} from '../services/user-session-service.js'
import { runMiddleware } from '../middleware-runner.js'
import { handleError } from '../handle-error.js'
import { pikkuState } from '../pikku-state.js'
import { PikkuFetchHTTPResponse } from './pikku-fetch-http-response.js'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request.js'

/**
 * Registers middleware either globally or for a specific route.
 *
 * When a string route pattern is provided along with middleware, the middleware
 * is applied only to that route. Otherwise, if an array is provided, it is treated
 * as global middleware (applied to all routes).
 *
 * @template APIMiddleware The middleware type.
 * @param {APIMiddleware[] | string} routeOrMiddleware - Either a global middleware array or a route pattern string.
 * @param {APIMiddleware[]} [middleware] - The middleware array to apply when a route pattern is specified.
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
 * Adds a new route to the global HTTP route registry.
 *
 * The route configuration includes the HTTP method, route path, permissions,
 * middleware, and the handler function that implements the route's logic.
 *
 * @template In Expected input type.
 * @template Out Expected output type.
 * @template Route Route pattern as a string.
 * @template APIFunction Type for the route handler function.
 * @template APIFunctionSessionless Type for a sessionless handler.
 * @template APIPermission Type representing required permissions.
 * @template APIMiddleware Middleware type to be used with the route.
 * @param {CoreHTTPFunctionRoute<In, Out, Route, APIFunction, APIFunctionSessionless, APIPermission, APIMiddleware>} route - The route configuration object.
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
 * Finds a matching route based on the HTTP method and URL path.
 *
 * Iterates over all registered routes, skipping those with a mismatched method.
 * When a route pattern matches the incoming request path, this function aggregates
 * any global middleware along with route-specific middleware and identifies any input schema.
 *
 * @param {string} requestType - The HTTP method (e.g., GET, POST).
 * @param {string} requestPath - The URL path of the incoming request.
 * @returns {Object | undefined} An object with matched route details or undefined if no match.
 */
const getMatchingRoute = (requestType: string, requestPath: string) => {
  const routes = pikkuState('http', 'routes')
  const middleware = pikkuState('http', 'middleware')
  const routesMeta = pikkuState('http', 'meta')

  for (const route of routes) {
    // Skip routes that don't match the HTTP method
    if (route.method !== requestType.toLowerCase()) {
      continue
    }

    // Generate a matching function from the route pattern
    const matchFunc = match(`/${route.route}`.replace(/^\/\//, '/'), {
      decode: decodeURIComponent,
    })

    // Attempt to match the request path
    const matchedPath = matchFunc(requestPath.replace(/^\/\//, '/'))

    if (matchedPath) {
      // Aggregate global and route-specific middleware
      const globalMiddleware = middleware
        .filter((m) => m.route === '*' || new RegExp(m.route).test(route.route))
        .map((m) => m.middleware)
        .flat()

      // Extract associated schema information if available
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
 * Combines the request and response objects into a single HTTP interaction object.
 *
 * This utility function creates an object that holds both the HTTP request and response,
 * which simplifies passing these around through middleware and route execution.
 *
 * @param {PikkuHTTPRequest | undefined} request - The HTTP request object.
 * @param {PikkuHTTPResponse | undefined} response - The HTTP response object.
 * @returns {PikkuHTTP | undefined} The combined HTTP interaction object or undefined if none provided.
 */
export const createHTTPInteraction = (
  request: PikkuHTTPRequest | undefined,
  response: PikkuHTTPResponse | undefined
): PikkuHTTP | undefined => {
  let http: PikkuHTTP | undefined = undefined

  if (request || response) {
    http = {}
    if (request) {
      http.request = request
    }
    if (response) {
      http.response = response
    }
  }

  return http
}

/**
 * Validates the input data and executes the route handler with associated middleware.
 *
 * This function is the central execution point for a route. It performs these steps:
 *  1. Sets URL parameters on the request.
 *  2. Validates the user session if required.
 *  3. Creates session-specific services.
 *  4. Validates the incoming data against a schema.
 *  5. Optionally coerces query string values to arrays.
 *  6. Checks route-specific permissions.
 *  7. Executes the route handler.
 *  8. Sends the appropriate response.
 *
 * @param {Object} services - A collection of shared services and utilities.
 * @param {Object} matchedRoute - Contains route details, URL parameters, middleware, and optional schema.
 * @param {PikkuHTTP | undefined} http - The HTTP interaction object.
 * @param {Object} options - Options for route execution (e.g., whether to coerce query strings to arrays).
 * @returns {Promise<any>} An object containing the route handler result and session services (if any).
 * @throws Throws errors like MissingSessionError or ForbiddenError on validation failures.
 */
const executeRouteWithMiddleware = async (
  services: {
    singletonServices: any
    userSession: UserSessionService<CoreUserSession>
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
    coerceDataFromSchema: boolean
  }
) => {
  const { matchedPath, params, route, middleware, schemaName } = matchedRoute
  const {
    singletonServices,
    userSession,
    createSessionServices,
    skipUserSession,
  } = services

  const requiresSession = route.auth !== false
  let sessionServices: any
  let result: any

  // Attach URL parameters to the request object
  http?.request?.setParams(params)

  singletonServices.logger.info(
    `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
  )

  // Main route execution logic wrapped for middleware handling
  const runMain = async () => {
    const session = userSession.get()

    // Ensure session is available when required
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

    // Create session-specific services for handling the request
    sessionServices = await createSessionServices(
      { ...singletonServices, userSession },
      { http },
      session
    )

    const allServices = {
      ...singletonServices,
      ...sessionServices,
      userSession,
      http,
    }
    const data = await http?.request?.data()

    // Validate request data against the defined schema, if any
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      data
    )

    // Coerce (top level) query string parameters or date objects if specified by the schema
    if (options.coerceDataFromSchema && schemaName) {
      coerceTopLevelDataFromSchema(schemaName, data)
    }

    // Execute permission checks
    const permissioned = await verifyPermissions(
      route.permissions,
      allServices,
      data,
      session
    )

    if (permissioned === false) {
      throw new ForbiddenError('Permission denied')
    }

    // Invoke the actual route handler function
    result = await route.func(allServices, data, session!)

    // Respond with either a binary or JSON response based on configuration
    if (route.returnsJSON === false) {
      http?.response?.arrayBuffer(result)
    } else {
      http?.response?.json(result)
    }

    http?.response?.status(200)
    // TODO: Evaluate if the response stream should be explicitly ended.
    // http?.response?.end()

    return result
  }

  // Execute middleware, then run the main logic
  await runMiddleware(
    { ...singletonServices, userSession },
    { http },
    middleware,
    runMain
  )

  return sessionServices ? { result, sessionServices } : { result }
}

/**
 * Executes an HTTP route for a given Fetch API request.
 *
 * This function wraps the entire lifecycle of handling an HTTP request:
 *  - Matching the request to a registered route.
 *  - Validating input and session state.
 *  - Running middleware and the route handler.
 *  - Handling errors and forming the response.
 *
 * @template In Expected input data type.
 * @template Out Expected output data type.
 * @param {Request} request - The native Fetch API Request object.
 * @param {RunRouteOptions & RunRouteParams} params - Additional options including services and session management.
 * @returns {Promise<Response>} A promise that resolves to a Fetch API Response object.
 */
export const fetch = async <In, Out>(
  request: Request,
  params: RunRouteOptions & RunRouteParams
): Promise<Response> => {
  const pikkuResponse = new PikkuFetchHTTPResponse()
  await fetchData<In, Out>(request, pikkuResponse, params)
  return pikkuResponse.toResponse()
}

/**
 * Executes an HTTP route using a Pikku-specific request wrapper.
 *
 * This variant accepts either a native Request or a PikkuHTTPRequest object and returns
 * a PikkuFetchHTTPResponse for further manipulation if needed.
 *
 * @template In Expected input data type.
 * @template Out Expected output data type.
 * @param {Request | PikkuHTTPRequest} request - The request object.
 * @param {RunRouteOptions & RunRouteParams} params - Execution options including services and session configuration.
 * @returns {Promise<PikkuFetchHTTPResponse>} A promise that resolves to a PikkuFetchHTTPResponse object.
 */
export const pikkuFetch = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  params: RunRouteOptions & RunRouteParams
): Promise<PikkuFetchHTTPResponse> => {
  const pikkuResponse = new PikkuFetchHTTPResponse()
  await fetchData<In, Out>(request, pikkuResponse, params)
  return pikkuResponse
}

/**
 * Core function to process an HTTP request through route matching, validation,
 * middleware execution, error handling, and session service cleanup.
 *
 * This function does the following:
 *  - Wraps the incoming request and response into an HTTP interaction object.
 *  - Determines the correct route based on HTTP method and path.
 *  - Executes middleware and the route handler.
 *  - Catches and handles errors, optionally bubbling them if configured.
 *  - Cleans up any session services created during processing.
 *
 * @template In Expected input data type.
 * @template Out Expected output data type.
 * @param {Request | PikkuHTTPRequest} request - The incoming HTTP request.
 * @param {PikkuHTTPResponse} response - The response object to be populated.
 * @param {RunRouteOptions & RunRouteParams} options - Options such as singleton services, session handling, and error configuration.
 * @returns {Promise<Out | void>} The output from the route handler or void if an error occurred.
 */
export const fetchData = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  response: PikkuHTTPResponse,
  {
    singletonServices,
    createSessionServices,
    skipUserSession = false,
    respondWith404 = true,
    logWarningsForStatusCodes = [],
    coerceDataFromSchema = true,
    bubbleErrors = false,
    generateRequestId,
  }: RunRouteOptions & RunRouteParams
): Promise<Out | void> => {
  const requestId =
    (request as any).getHeader?.('x-request-id') ||
    generateRequestId?.() ||
    createWeakUID()
  const userSession = new PikkuUserSessionService()
  let sessionServices: SessionServices<typeof singletonServices> | undefined
  let result: Out

  // Combine the request and response into one interaction object
  const http = createHTTPInteraction(
    request instanceof Request ? new PikkuFetchHTTPRequest(request) : request,
    response
  )
  const apiType = http!.request!.method()
  const apiRoute = http!.request!.path()

  // Locate the matching route based on the HTTP method and path
  const matchedRoute = getMatchingRoute(apiType, apiRoute)

  try {
    // If no route matches, log the occurrence and throw a NotFoundError
    if (!matchedRoute) {
      singletonServices.logger.info({
        message: 'Route not found',
        apiRoute,
        apiType,
      })
      throw new NotFoundError(`Route not found: ${apiRoute}`)
    }

    // Execute the matched route along with its middleware and session management
    ;({ result, sessionServices } = await executeRouteWithMiddleware(
      {
        singletonServices,
        userSession,
        createSessionServices,
        skipUserSession,
      },
      matchedRoute,
      http,
      { coerceDataFromSchema }
    ))

    return result
  } catch (e: any) {
    // Handle errors and, depending on configuration, bubble them up or respond with an error
    handleError(
      e,
      http,
      requestId,
      singletonServices.logger,
      logWarningsForStatusCodes,
      respondWith404,
      bubbleErrors
    )
  } finally {
    // Clean up any session-specific services created during processing
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}
