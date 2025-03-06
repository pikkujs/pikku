import { getErrorResponse } from '../errors/error-handler.js'
import { verifyPermissions } from '../permissions.js'
import {
  CoreHTTPFunctionRoute,
  HTTPRoutesMeta,
  RunRouteOptions,
  RunRouteParams,
  PikkuHTTP,
} from './http-routes.types.js'
import { CoreUserSession, PikkuMiddleware, SessionServices } from '../types/core.types.js'
import { match } from 'path-to-regexp'
import { PikkuHTTPAbstractRequest } from './pikku-http-abstract-request.js'
import { PikkuHTTPAbstractResponse } from './pikku-http-abstract-response.js'
import { Logger } from '../services/index.js'
import {
  ForbiddenError,
  MissingSessionError,
  NotFoundError,
  NotImplementedError,
} from '../errors/errors.js'
import crypto from 'crypto'
import { closeSessionServices } from '../utils.js'
import { CoreAPIChannel } from '../channel/channel.types.js'
import { PikkuRequest } from '../pikku-request.js'
import { PikkuResponse } from '../pikku-response.js'
import { HTTPSessionService } from './http-session-service.js'
import { coerceQueryStringToArray, validateSchema } from '../schema.js'
import { LocalUserSessionService } from '../services/user-session-service.js'

if (!globalThis.pikku?.httpRoutes) {
  globalThis.pikku = globalThis.pikku || {}
  globalThis.pikku.httpRoutes = []
  globalThis.pikku.httpRoutesMeta = []
}

const httpRoutes = (
  data?: CoreHTTPFunctionRoute<any, any, any>[]
): CoreHTTPFunctionRoute<any, any, any>[] => {
  if (data) {
    globalThis.pikku.httpRoutes = data
  }
  return globalThis.pikku.httpRoutes
}

const httpRoutesMeta = (data?: HTTPRoutesMeta): HTTPRoutesMeta => {
  if (data) {
    globalThis.pikku.httpRoutesMeta = data
  }
  return globalThis.pikku.httpRoutesMeta
}

export const addRoute = <
  In,
  Out,
  Route extends string,
  APIFunction,
  APIFunctionSessionless,
  APIPermission,
>(
  route: CoreHTTPFunctionRoute<
    In,
    Out,
    Route,
    APIFunction,
    APIFunctionSessionless,
    APIPermission
  >
) => {
  httpRoutes().push(route as any)
}

export const clearRoutes = () => {
  httpRoutes([])
}

/**
 * @ignore
 */
export const setHTTPRoutesMeta = (_routeMeta: HTTPRoutesMeta) => {
  httpRoutesMeta(_routeMeta)
}

/**
 * Returns all the registered routes and associated metadata.
 * @internal
 */
export const getRoutes = () => {
  return {
    routes: httpRoutes(),
    routesMeta: httpRoutesMeta(),
  }
}

const getMatchingRoute = (
  requestType: string,
  requestPath: string
) => {
  for (const route of httpRoutes()) {
    // TODO: This is a performance improvement, but we could
    // run against all routes if we want to return a 405 method.
    // Probably want a cache to support.
    if (route.method !== requestType.toLowerCase()) {
      continue
    }
    const matchFunc = match(`/${route.route}`.replace(/^\/\//, '/'), {
      decode: decodeURIComponent,
    })
    const matchedPath = matchFunc(requestPath.replace(/^\/\//, '/'))

    if (matchedPath) {
      // TODO: Cache this loop as a performance improvement
      const schemaName = httpRoutesMeta().find(
        (routeMeta) =>
          routeMeta.method === route.method && routeMeta.route === route.route
      )?.input

      // TODO
      const middlewares: PikkuMiddleware[] = []

      return { matchedPath, params: matchedPath.params, route, schemaName, middlewares }
    }
  }
  return undefined
}

export const getUserSession = async <UserSession extends CoreUserSession>(
  httpSessionService: HTTPSessionService<UserSession> | undefined,
  auth: boolean,
  request: PikkuHTTPAbstractRequest
): Promise<CoreUserSession | undefined> => {
  if (httpSessionService) {
    return (await httpSessionService.getUserSession(
      auth,
      request
    )) as UserSession
  } else if (auth) {
    throw new NotImplementedError('Session service not implemented')
  }
  return undefined
}

export const loadUserSession = async (
  skipUserSession: boolean,
  requiresSession: boolean,
  http: PikkuHTTP | undefined,
  matchedPath: any,
  route:
    | CoreHTTPFunctionRoute<unknown, unknown, any>
    | CoreAPIChannel<unknown, any>,
  logger: Logger,
  httpSessionService: HTTPSessionService | undefined
) => {
  if (skipUserSession && requiresSession) {
    throw new Error("Can't skip trying to get user session if auth is required")
  }

  if (skipUserSession === false) {
    try {
      if (http?.request) {
        return await getUserSession(
          httpSessionService,
          requiresSession,
          http.request
        )
      } else if (requiresSession) {
        logger.error({
          action: 'Can only get user session with HTTP request',
          path: matchedPath,
          route,
        })
        throw new Error('Can only get user session with HTTP request')
      }
    } catch (e: any) {
      if (requiresSession) {
        logger.info({
          action: 'Rejecting route (invalid session)',
          path: matchedPath,
        })
        throw e
      }
    }
  }

  return undefined
}

export const createHTTPInteraction = (
  request: PikkuRequest | undefined,
  response: PikkuResponse | undefined
) => {
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

export const handleError = (
  e: any,
  http: PikkuHTTP | undefined,
  trackerId: string,
  logger: Logger,
  logWarningsForStatusCodes: number[],
  respondWith404: boolean,
  bubbleError: boolean
) => {
  if (e instanceof NotFoundError && !respondWith404) {
    return
  }

  const errorResponse = getErrorResponse(e)
  if (errorResponse != null) {
    http?.response?.setStatus(errorResponse.status)
    http?.response?.setJson({
      message: errorResponse.message,
      payload: (e as any).payload,
      traceId: trackerId,
    })

    if (logWarningsForStatusCodes.includes(errorResponse.status)) {
      logger.warn(`Warning id: ${trackerId}`)
      logger.warn(e)
    }
  } else {
    logger.warn(`Error id: ${trackerId}`)
    logger.error(e)
    http?.response?.setStatus(500)
    http?.response?.setJson({ errorId: trackerId })
  }

  if (e instanceof NotFoundError) {
    http?.response?.end()
  }

  if (bubbleError) {
    throw e
  }
}

/**
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
  const userSessionService = new LocalUserSessionService()
  let sessionServices: SessionServices<typeof singletonServices> | undefined
  let middlewares: PikkuMiddleware[] | undefined

  const http = createHTTPInteraction(request, response)
  const interaction = { http }

  const matchedRoute = getMatchingRoute(
    apiType,
    apiRoute
  )

  try {
    if (!matchedRoute) {
      singletonServices.logger.info({
        message: 'Route not found',
        apiRoute,
        apiType,
      })
      throw new NotFoundError(`Route not found: ${apiRoute}`)
    }

    const { matchedPath, params, route, schemaName } = matchedRoute
    middlewares = matchedRoute.middlewares
  
    const requiresSession = route.auth !== false
    http?.request?.setParams(params)

    singletonServices.logger.info(
      `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
    )

    const next = async () => {

    }

    // Run middleware start
    for (const middleware of middlewares) {
      await middleware(
        { ...singletonServices, userSessionService },
        interaction,
        next
      )
    }

    // Validate session was set if needed
    const session = userSessionService.getSession()
    if (skipUserSession && requiresSession) {
      throw new Error("Can't skip trying to get user session if auth is required")
    }
    if (requiresSession) {
      singletonServices.logger.info({
        action: 'Rejecting route (invalid session)',
        path: matchedPath,
      })
      throw new MissingSessionError()
    }

    const data = await request.getData()

    // Validate schema. This can be done via middleware, but
    // we do it here since it's a core piece of functionality.
    validateSchema(
      singletonServices.logger,
      singletonServices.schemaService,
      schemaName,
      data,
    )
    if (coerceToArray && schemaName) {
      coerceQueryStringToArray(schemaName, data)
    }

    sessionServices = await createSessionServices(
      singletonServices,
      { http },
      session
    )
    const allServices = { ...singletonServices, ...sessionServices, http }

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

    const result: any = (await route.func(
      allServices,
      data,
      session!
    )) as unknown as Out

    if (route.returnsJSON === false) {
      http?.response?.setResponse(result)
    } else {
      http?.response?.setJson(result)
    }
    http?.response?.setStatus(200)
    http?.response?.end()

    return result
  } catch (e: any) {
    const trackerId: string = crypto.randomUUID().toString()
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
    // Run middleware end

    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}
