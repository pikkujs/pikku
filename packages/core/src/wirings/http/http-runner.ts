import type {
  CoreHTTPFunctionWiring,
  RunHTTPWiringOptions,
  PikkuHTTP,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
  HTTPWiringMeta,
  HTTPMethod,
} from './http.types.js'
import type {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
  CorePermissionGroup,
} from '../../function/functions.types.js'
import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  WireServices,
  PikkuWire,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { NotFoundError, PikkuMissingMetaError } from '../../errors/errors.js'
import {
  closeWireServices,
  createWeakUID,
  isSerializable,
} from '../../utils.js'
import {
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { PikkuSessionService } from '../../services/user-session-service.js'
import { handleHTTPError } from '../../handle-error.js'
import { pikkuState } from '../../pikku-state.js'
import { PikkuFetchHTTPResponse } from './pikku-fetch-http-response.js'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'
import { validateSchema } from '../../schema.js'

/**
 * Extract headers from a PikkuHTTPRequest based on the schema keys
 */
function extractHeadersFromRequest(
  request: PikkuHTTPRequest,
  headerKeys: string[]
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {}
  for (const headerName of headerKeys) {
    const value = request.header(headerName)
    if (value !== null) {
      headers[headerName] = value
    }
  }
  return headers
}

/**
 * Registers HTTP middleware for a specific route pattern.
 *
 * This function registers middleware at runtime that will be applied to
 * HTTP routes matching the specified pattern.
 *
 * For tree-shaking benefits, wrap in a factory function:
 * `export const x = () => addHTTPMiddleware('pattern', [...])`
 *
 * @template PikkuMiddleware The middleware type.
 * @param {string} pattern - Route pattern (e.g., '*' for all routes, '/api/*' for specific routes).
 * @param {CorePikkuMiddlewareGroup} middleware - Array of middleware for this route pattern.
 *
 * @returns {CorePikkuMiddlewareGroup} The middleware array (for chaining/wrapping).
 *
 * @example
 * ```typescript
 * // Recommended: tree-shakeable
 * export const httpGlobal = () => addHTTPMiddleware('*', [
 *   corsMiddleware,
 *   loggingMiddleware
 * ])
 *
 * // Also works: no tree-shaking
 * export const apiMiddleware = addHTTPMiddleware('/api/*', [
 *   authMiddleware
 * ])
 * ```
 */
export const addHTTPMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  pattern: string,
  middleware: CorePikkuMiddlewareGroup,
  packageName: string | null = null
): CorePikkuMiddlewareGroup => {
  const httpGroups = pikkuState(packageName, 'middleware', 'httpGroup')
  httpGroups[pattern] = middleware
  return middleware
}

/**
 * Registers HTTP permissions for a specific route pattern.
 *
 * This function registers permissions at runtime that will be applied to
 * HTTP routes matching the specified pattern.
 *
 * For tree-shaking benefits, wrap in a factory function:
 * `export const x = () => addHTTPPermission('pattern', [...])`
 *
 * @template PikkuPermission The permission type.
 * @param {string} pattern - Route pattern (e.g., '*' for all routes, '/api/*' for specific routes).
 * @param {CorePermissionGroup | CorePikkuPermission[]} permissions - Permissions for this route pattern.
 *
 * @returns {CorePermissionGroup | CorePikkuPermission[]} The permissions (for chaining/wrapping).
 *
 * @example
 * ```typescript
 * // Recommended: tree-shakeable
 * export const httpGlobalPermissions = () => addHTTPPermission('*', [
 *   authenticatedPermission,
 *   rateLimitPermission
 * ])
 *
 * // Also works: no tree-shaking
 * export const apiPermissions = addHTTPPermission('/api/*', [
 *   adminPermission
 * ])
 * ```
 */
export const addHTTPPermission = <PikkuPermission extends CorePikkuPermission>(
  pattern: string,
  permissions: CorePermissionGroup | CorePikkuPermission[],
  packageName: string | null = null
): CorePermissionGroup | CorePikkuPermission[] => {
  const httpGroups = pikkuState(packageName, 'permissions', 'httpGroup')
  httpGroups[pattern] = permissions
  return permissions
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
  PikkuFunction extends CorePikkuFunction<In, Out> = CorePikkuFunction<In, Out>,
  PikkuFunctionSessionless extends CorePikkuFunctionSessionless<
    In,
    Out
  > = CorePikkuFunctionSessionless<In, Out>,
  PikkuPermissionGroup extends
    CorePikkuPermission<In> = CorePikkuPermission<In>,
  PikkuMiddleware extends CorePikkuMiddleware = CorePikkuMiddleware,
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
  const httpMeta = pikkuState(null, 'http', 'meta')
  const routeMeta = httpMeta[httpWiring.method][httpWiring.route]
  if (!routeMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for HTTP route '${httpWiring.method.toUpperCase()} ${httpWiring.route}'`
    )
  }
  if (httpWiring.func) {
    addFunction(routeMeta.pikkuFuncId, httpWiring.func)
  }
  const routes = pikkuState(null, 'http', 'routes')
  if (!routes.has(httpWiring.method)) {
    routes.set(httpWiring.method, new Map())
  }
  pikkuState(null, 'http', 'routes')
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
    const route = pikkuState(null, 'http', 'routes')
      .get(requestType.toLowerCase() as HTTPMethod)!
      .get(matchedPath.route)!
    const meta = pikkuState(null, 'http', 'meta')[
      requestType.toLowerCase() as PikkuWiringTypes
    ][route.route]

    return {
      matchedPath,
      params: matchedPath.params,
      route,
      permissions: route.permissions,
      meta: meta!,
    }
  }
}

/**
 * Combines the request and response objects into a single HTTP wire object.
 *
 * This utility function creates an object that holds both the HTTP request and response,
 * which simplifies passing these around through middleware and route execution.
 *
 * @param {PikkuHTTPRequest | undefined} request - The HTTP request object.
 * @param {PikkuHTTPResponse | undefined} response - The HTTP response object.
 * @returns {PikkuHTTP | undefined} The combined HTTP wire object or undefined if none provided.
 */
export const createHTTPWire = (
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
 * Validates the input data and executes the route handler
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
 * @param {Object} matchedRoute - Contains route details, URL parameters, and optional schema.
 * @param {PikkuHTTP | undefined} http - The HTTP wire object.
 * @param {Object} options - Options for route execution (e.g., whether to coerce query strings to arrays).
 * @returns {Promise<any>} An object containing the route handler result and wire services (if any).
 * @throws Throws errors like MissingSessionError or ForbiddenError on validation failures.
 */
const executeRoute = async (
  services: {
    singletonServices: any
    createWireServices?: any
    skipUserSession: boolean
    requestId: string
  },
  matchedRoute: {
    matchedPath: any
    params: any
    route: CoreHTTPFunctionWiring<any, any, any>
    meta: HTTPWiringMeta
  },
  http: PikkuHTTP,
  options: {
    coerceDataFromSchema: boolean
  }
) => {
  const userSession = new PikkuSessionService<CoreUserSession>()
  const { params, route, meta } = matchedRoute
  const { singletonServices, createWireServices, skipUserSession, requestId } =
    services

  // Attach URL parameters to the request object
  http?.request?.setParams(params)

  // Validate request headers if schema is defined
  if (meta.headersSchemaName && http.request && singletonServices.schema) {
    const headerKeys = singletonServices.schema.getSchemaKeys(
      meta.headersSchemaName
    )
    const rawHeaders = extractHeadersFromRequest(http.request, headerKeys)
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      meta.headersSchemaName,
      rawHeaders
    )
  }

  const requiresSession = route.auth !== false
  let wireServices: any
  let result: any

  singletonServices.logger.info(
    `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
  )

  // Ensure session is available when required
  if (skipUserSession && requiresSession) {
    throw new Error("Can't skip trying to get user session if auth is required")
  }

  let cachedData: unknown | undefined
  const data = async () => {
    if (cachedData === undefined) {
      cachedData = await http.request!.data()
    }
    return cachedData
  }
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

  const wire: PikkuWire = {
    http,
    channel,
    session: userSession.get() as CoreUserSession | undefined,
    setSession: (s: any) => userSession.setInitial(s),
    getSession: () => userSession.get(),
    hasSessionChanged: () => userSession.sessionChanged,
  }

  result = await runPikkuFunc(
    'http',
    `${meta.method}:${meta.route}`,
    meta.pikkuFuncId,
    {
      singletonServices,
      createWireServices,
      auth: route.auth !== false,
      data,
      inheritedMiddleware: meta.middleware,
      wireMiddleware: route.middleware,
      inheritedPermissions: meta.permissions,
      wirePermissions: route.permissions,
      coerceDataFromSchema: options.coerceDataFromSchema,
      tags: route.tags,
      wire,
      sessionService: userSession,
    }
  )
  if (!matchedRoute.route.sse) {
    if (result === undefined || result === null) {
      http?.response?.status(204)
    } else if (route.returnsJSON === false) {
      http?.response?.arrayBuffer(result)
    } else {
      http?.response?.status(200)
      http?.response?.json(result)
    }
  }

  return wireServices ? { result, wireServices } : { result }
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
 * @param {RunHTTPWiringOptions} params - Additional options including services and session management.
 * @returns {Promise<Response>} A promise that resolves to a Fetch API Response object.
 */
export const fetch = async <In, Out>(
  request: Request,
  params: RunHTTPWiringOptions = {}
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
 * @param {RunHTTPWiringOptions} params - Execution options including services and session configuration.
 * @returns {Promise<PikkuFetchHTTPResponse>} A promise that resolves to a PikkuFetchHTTPResponse object.
 */
export const pikkuFetch = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  params: RunHTTPWiringOptions = {}
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
 *  - Wraps the incoming request and response into an HTTP wire object.
 *  - Determines the correct route based on HTTP method and path.
 *  - Executes middleware and the route handler.
 *  - Catches and handles errors, optionally bubbling them if configured.
 *  - Cleans up any wire services created during processing.
 *
 * @template In Expected input data type.
 * @template Out Expected output data type.
 * @param {Request | PikkuHTTPRequest} request - The incoming HTTP request.
 * @param {PikkuHTTPResponse} response - The response object to be populated.
 * @param {RunHTTPWiringOptions} options - Options such as singleton services, session handling, and error configuration.
 * @returns {Promise<Out | void>} The output from the route handler or void if an error occurred.
 */
export const fetchData = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  response: PikkuHTTPResponse,
  {
    skipUserSession = false,
    respondWith404 = true,
    logWarningsForStatusCodes = [],
    coerceDataFromSchema = true,
    bubbleErrors = false,
    generateRequestId,
  }: RunHTTPWiringOptions = {}
): Promise<Out | void> => {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let wireServices: WireServices<typeof singletonServices> | undefined
  let result: Out

  // Combine the request and response into one wire object
  const pikkuRequest =
    request instanceof Request ? new PikkuFetchHTTPRequest(request) : request
  let requestId: string | null = null
  try {
    requestId = pikkuRequest.header('x-request-id')
  } catch {}
  requestId = requestId || generateRequestId?.() || createWeakUID()
  const http = createHTTPWire(pikkuRequest, response)
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
    ;({ result, wireServices } = await executeRoute(
      {
        singletonServices,
        createWireServices,
        skipUserSession,
        requestId,
      },
      matchedRoute,
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
    if (wireServices) {
      await closeWireServices(singletonServices.logger, wireServices)
    }
  }
}
