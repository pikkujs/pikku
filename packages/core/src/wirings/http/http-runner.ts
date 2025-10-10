import {
  CoreHTTPFunctionWiring,
  RunHTTPWiringOptions,
  RunHTTPWiringParams,
  PikkuHTTP,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
  HTTPWiringMeta,
  HTTPMethod,
} from './http.types.js'
import {
  CoreUserSession,
  CorePikkuMiddleware,
  SessionServices,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { NotFoundError } from '../../errors/errors.js'
import {
  closeSessionServices,
  createWeakUID,
  isSerializable,
} from '../../utils.js'
import { PikkuUserSessionService } from '../../services/user-session-service.js'
import { handleHTTPError } from '../../handle-error.js'
import { pikkuState } from '../../pikku-state.js'
import { PikkuFetchHTTPResponse } from './pikku-fetch-http-response.js'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request.js'
import { PikkuChannel } from '../channel/channel.types.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { httpRouter } from './routers/http-router.js'

/**
 * Registers middleware either globally or for a specific route.
 *
 * When a string route pattern is provided along with middleware, the middleware
 * is applied only to that route. Otherwise, if an array is provided, it is treated
 * as global middleware (applied to all routes).
 *
 * @template PikkuMiddleware The middleware type.
 * @param {PikkuMiddleware[] | string} routeOrMiddleware - Either a global middleware array or a route pattern string.
 * @param {PikkuMiddleware[]} [middleware] - The middleware array to apply when a route pattern is specified.
 */
export const addHTTPMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  routeOrMiddleware: PikkuMiddleware[] | string,
  middleware?: PikkuMiddleware[]
) => {
  const middlewareStore = pikkuState('http', 'middleware')
  let route = '*'

  if (typeof routeOrMiddleware === 'string') {
    route = routeOrMiddleware
    middleware = middleware!
  } else {
    middleware = routeOrMiddleware
  }

  const currentMiddleware = middlewareStore.get(route)
  if (currentMiddleware) {
    middlewareStore.set(route, [...currentMiddleware, ...middleware])
  } else {
    middlewareStore.set(route, middleware)
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
 * @template PikkuFunction Type for the route handler function.
 * @template PikkuFunctionSessionless Type for a sessionless handler.
 * @template PikkuPermissionGroup Type representing required permissions.
 * @template PikkuMiddleware Middleware type to be used with the route.
 * @param {CoreHTTPFunctionWiring<In, Out, Route, PikkuFunction, PikkuFunctionSessionless, PikkuPermission, PikkuMiddleware>} httpWiring - The HTTP wiring configuration object.
 */
export const wireHTTP = <
  In,
  Out,
  Route extends string,
  PikkuFunction,
  PikkuFunctionSessionless,
  PikkuPermissionGroup,
  PikkuMiddleware,
>(
  httpWiring: CoreHTTPFunctionWiring<
    In,
    Out,
    Route,
    PikkuFunction,
    PikkuFunctionSessionless,
    PikkuPermissionGroup,
    PikkuMiddleware
  >
) => {
  const httpMeta = pikkuState('http', 'meta')
  const routeMeta = httpMeta[httpWiring.method][httpWiring.route]
  if (!routeMeta) {
    throw new Error('Route metadata not found')
  }
  addFunction(routeMeta.pikkuFuncName, {
    func: httpWiring.func,
    auth: httpWiring.auth,
    permissions: httpWiring.permissions,
    middleware: httpWiring.middleware as any,
    tags: httpWiring.tags,
    docs: httpWiring.docs as any,
  })
  const routes = pikkuState('http', 'routes')
  if (!routes.has(httpWiring.method)) {
    routes.set(httpWiring.method, new Map())
  }
  pikkuState('http', 'routes')
    .get(httpWiring.method)
    ?.set(httpWiring.route, httpWiring as any)
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
  const matchedPath = httpRouter.match(
    requestType.toLowerCase() as HTTPMethod,
    requestPath
  )

  if (matchedPath) {
    const route = pikkuState('http', 'routes')
      .get(requestType.toLowerCase() as HTTPMethod)!
      .get(matchedPath.route)!
    const meta = pikkuState('http', 'meta')[
      requestType.toLowerCase() as PikkuWiringTypes
    ][route.route]

    return {
      matchedPath,
      params: matchedPath.params,
      route,
      permissions: route.permissions,
      httpMiddleware: matchedPath.middleware,
      middleware: route.middleware,
      meta: meta!,
    }
  }
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
 * NOTE: HTTP wiring handles middleware differently from other wirings (RPC, MCP, Queue, etc.)
 * because HTTP needs to:
 * 1. Check session early for performance (before expensive body parsing)
 * 2. Handle HTTP-specific concerns (headers, cookies, SSE setup)
 * 3. Process middleware that may set up authentication/session state
 *
 * Other wirings (RPC/MCP/Queue/Scheduler) simply pass middleware/permissions/auth
 * directly to runPikkuFunc without processing them.
 *
 * This function performs these steps:
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
const executeRoute = async (
  services: {
    singletonServices: any
    createSessionServices: Function
    skipUserSession: boolean
    requestId: string
  },
  matchedRoute: {
    matchedPath: any
    params: any
    route: CoreHTTPFunctionWiring<any, any, any>
    httpMiddleware: CorePikkuMiddleware[] | undefined
    middleware: CorePikkuMiddleware[] | undefined
    meta: HTTPWiringMeta
  },
  http: PikkuHTTP,
  options: {
    coerceDataFromSchema: boolean
  }
) => {
  const userSession = new PikkuUserSessionService<CoreUserSession>()
  const { params, route, httpMiddleware, middleware, meta } = matchedRoute
  const {
    singletonServices,
    createSessionServices,
    skipUserSession,
    requestId,
  } = services

  const requiresSession = route.auth !== false
  let sessionServices: any
  let result: any

  // Attach URL parameters to the request object
  http?.request?.setParams(params)

  singletonServices.logger.info(
    `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
  )

  // Ensure session is available when required
  if (skipUserSession && requiresSession) {
    throw new Error("Can't skip trying to get user session if auth is required")
  }

  const data = http.request!.data
  let channel: PikkuChannel<unknown, unknown> | undefined

  if (matchedRoute.route.sse) {
    const response = http?.response
    if (!response) {
      throw new Error('SSE requires a valid HTTP response object')
    }
    if (!response.setMode) {
      throw new Error('Response object does not support SSE mode')
    }
    response.setMode('stream')
    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache')
    response.header('Connection', 'keep-alive')
    response.header('Transfer-Encoding', 'chunked')
    channel = {
      channelId: requestId,
      openingData: await data(),
      send: (data: any) => {
        response.arrayBuffer(isSerializable(data) ? JSON.stringify(data) : data)
      },
      close: () => {
        channel!.state = 'closed'
        response.close?.()
      },
      state: 'open',
    }
  }

  const getAllServices = async (session?: CoreUserSession) => {
    let channel: PikkuChannel<unknown, unknown> | undefined

    // Create session-specific services for handling the request
    sessionServices = await createSessionServices(
      { ...singletonServices, userSession, channel },
      { http },
      session
    )

    return rpcService.injectRPCService({
      ...singletonServices,
      ...sessionServices,
      http,
      userSession,
      channel,
    })
  }

  result = await runPikkuFunc(
    PikkuWiringTypes.http,
    `${meta.method}:${meta.route}`,
    meta.pikkuFuncName,
    {
      singletonServices,
      getAllServices,
      auth: route.auth !== false,
      userSession,
      middleware: [...(httpMiddleware || []), ...(middleware || [])],
      data,
      permissions: route.permissions,
      coerceDataFromSchema: options.coerceDataFromSchema,
      tags: route.tags,
      interaction: { http, channel },
    }
  )

  // Respond with either a binary or JSON response based on configuration
  if (route.returnsJSON === false) {
    http?.response?.arrayBuffer(result)
  } else {
    http?.response?.json(result)
  }

  http?.response?.status(200)
  // TODO: Evaluate if the response stream should be explicitly ended.
  // http?.response?.end()

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
 * @param {RunHTTPWiringOptions & RunHTTPWiringParams} params - Additional options including services and session management.
 * @returns {Promise<Response>} A promise that resolves to a Fetch API Response object.
 */
export const fetch = async <In, Out>(
  request: Request,
  params: RunHTTPWiringOptions & RunHTTPWiringParams
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
 * @param {RunHTTPWiringOptions & RunHTTPWiringParams} params - Execution options including services and session configuration.
 * @returns {Promise<PikkuFetchHTTPResponse>} A promise that resolves to a PikkuFetchHTTPResponse object.
 */
export const pikkuFetch = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  params: RunHTTPWiringOptions & RunHTTPWiringParams
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
 * @param {RunHTTPWiringOptions & RunHTTPWiringParams} options - Options such as singleton services, session handling, and error configuration.
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
    ignoreMiddleware = false,
  }: RunHTTPWiringOptions & RunHTTPWiringParams
): Promise<Out | void> => {
  const requestId =
    (request as any).getHeader?.('x-request-id') ||
    generateRequestId?.() ||
    createWeakUID()
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
    ;({ result, sessionServices } = await executeRoute(
      {
        singletonServices,
        createSessionServices,
        skipUserSession,
        requestId,
      },
      ignoreMiddleware
        ? {
            ...matchedRoute,
            middleware: undefined,
            httpMiddleware: undefined,
          }
        : matchedRoute,
      http!,
      { coerceDataFromSchema }
    ))

    return result
  } catch (e: any) {
    // Handle errors and, depending on configuration, bubble them up or respond with an error
    handleHTTPError(
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
