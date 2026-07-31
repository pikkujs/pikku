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
} from '../../function/functions.types.js'
import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  PikkuRawWire,
  PikkuWire,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { NotFoundError } from '../../errors/errors.js'
import { createWeakUID, isSerializable } from '../../utils.js'
import {
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { PikkuSessionService } from '../../services/user-session-service.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { handleHTTPError } from '../../handle-error.js'
import { isProduction } from '../../env.js'
import { pikkuState } from '../../pikku-state.js'
import { PikkuFetchHTTPResponse } from './pikku-fetch-http-response.js'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import { unsupportedChannelRemote } from '../channel/channel-rpc.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { applyWebResponse } from './web-request.js'
import { httpRouter } from './routers/http-router.js'
import { validateSchema } from '../../schema.js'
import { runMiddleware } from '../../middleware-runner.js'

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

export const addHTTPMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  pattern: string,
  middleware: CorePikkuMiddlewareGroup,
  packageName: string | null = null
): CorePikkuMiddlewareGroup => {
  const httpGroups = pikkuState(packageName, 'middleware', 'httpGroup')
  const existing = httpGroups[pattern] as CorePikkuMiddleware[] | undefined
  httpGroups[pattern] = existing
    ? [...existing, ...(middleware as CorePikkuMiddleware[])]
    : middleware
  return middleware
}

/**
 * @deprecated HTTP-route-level permissions were removed in #972 — permissions
 * are now function-scoped only (declare them on the function via
 * `pikkuFunc({ permissions })`). This throwing stub exists solely so the pinned
 * bootstrap CLI (which still generates an `addHTTPPermission` wrapper) can
 * resolve the import at build time; it is never called. Delete once
 * `PIKKU_CLI_VERSION` in the CLI build is bumped past the release that removes
 * HTTP-route permissions.
 */
export const addHTTPPermission = (
  _pattern: string,
  _permissions:
    | Record<string, CorePikkuPermission | CorePikkuPermission[]>
    | CorePikkuPermission[]
): never => {
  throw new Error(
    'addHTTPPermission was removed in #972 — HTTP-route-level permissions no longer exist. Declare permissions on the function definition instead: pikkuFunc({ permissions }).'
  )
}

export const wireHTTP = <
  In,
  Out,
  Route extends string,
  PikkuFunction extends CorePikkuFunction<In, Out> = CorePikkuFunction<In, Out>,
  PikkuFunctionSessionless extends CorePikkuFunctionSessionless<In, Out> =
    CorePikkuFunctionSessionless<In, Out>,
  PikkuPermissionGroup extends CorePikkuPermission<In> =
    CorePikkuPermission<In>,
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
    console.warn(
      `[pikku] Skipping HTTP route '${httpWiring.method.toUpperCase()} ${httpWiring.route}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
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
      meta: meta!,
    }
  }
}

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
  const { params, route, meta } = matchedRoute
  const { singletonServices, createWireServices, skipUserSession, requestId } =
    services
  const userSession = new PikkuSessionService<CoreUserSession>(
    singletonServices.sessionStore
  )

  http?.request?.setParams(params)

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
  let result: any

  singletonServices.logger.info(
    `Matched route: ${route.route} | method: ${route.method.toUpperCase()} | auth: ${requiresSession.toString()}`
  )

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
    let sseState: unknown
    const channelId = createWeakUID()
    channel = {
      channelId,
      openingData: await data(),
      send: (data: any) => {
        response.arrayBuffer(isSerializable(data) ? JSON.stringify(data) : data)
      },
      sendBinary: (data) => {
        response.arrayBuffer(data)
      },
      close: () => {
        channel!.state = 'closed'
        response.close?.()
      },
      state: 'open',
      setState: (s) => {
        sseState = s
      },
      getState: () => sseState as any,
      clearState: () => {
        sseState = undefined
      },
      // SSE only flows server to client — the client has no way to answer on
      // this channel, so a remote call could never be replied to.
      remote: unsupportedChannelRemote,
    }

    if (singletonServices.eventHub?.onChannelOpened) {
      const channelRef = channel
      const channelHandler = {
        getChannel: () => channelRef,
        send: (data: unknown, isBinary?: boolean) => {
          if (isBinary) channelRef.sendBinary(data as any)
          else channelRef.send(data)
        },
        sendBinary: (data: any) => channelRef.sendBinary(data),
      }
      singletonServices.eventHub.onChannelOpened(channelHandler)
      const originalClose = channel.close
      channel.close = () => {
        singletonServices.eventHub.onChannelClosed(channelId)
        originalClose()
      }
    }
  }

  const wire: PikkuRawWire = {
    traceId: requestId,
    http,
    channel,
    session: userSession.get() as CoreUserSession | undefined,
    setSession: (s: any) => userSession.setInitial(s),
    getSession: () => userSession.get(),
    hasSessionChanged: () => userSession.sessionChanged,
  }

  try {
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
        coerceDataFromSchema: options.coerceDataFromSchema,
        tags: route.tags,
        wire,
        sessionService: userSession,
        packageName: meta.packageName,
      }
    )
  } catch (e: any) {
    if (matchedRoute.route.sse) {
      singletonServices.logger.error(e instanceof Error ? e.message : e)
      try {
        const errorResponse = getErrorResponse(e)
        http?.response?.arrayBuffer(
          JSON.stringify({
            type: 'error',
            errorText: errorResponse?.message ?? 'Internal server error',
          })
        )
        http?.response?.arrayBuffer(JSON.stringify({ type: 'done' }))
      } catch {}
      channel?.close()
      return { result }
    }
    throw e
  }
  if (matchedRoute.route.sse) {
    http?.response?.flushHeaders?.()
  } else {
    if (result instanceof Response) {
      await applyWebResponse(http!.response!, result)
    } else if (result === undefined || result === null) {
      http?.response?.status(204)
    } else if (route.returnsJSON === false) {
      http?.response?.arrayBuffer(result)
    } else {
      http?.response?.status(200)
      http?.response?.json(result)
    }
  }

  return { result }
}

export const fetch = async <In, Out>(
  request: Request,
  params: RunHTTPWiringOptions = {}
): Promise<Response> => {
  const pikkuResponse = new PikkuFetchHTTPResponse()
  await fetchData<In, Out>(request, pikkuResponse, params)
  return pikkuResponse.toResponse()
}

export const pikkuFetch = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  params: RunHTTPWiringOptions = {}
): Promise<PikkuFetchHTTPResponse> => {
  const pikkuResponse = new PikkuFetchHTTPResponse()
  await fetchData<In, Out>(request, pikkuResponse, params)
  return pikkuResponse
}

export const fetchData = async <In, Out>(
  request: Request | PikkuHTTPRequest,
  response: PikkuHTTPResponse,
  {
    skipUserSession = false,
    respondWith404 = true,
    logWarningsForStatusCodes = [],
    coerceDataFromSchema = true,
    bubbleErrors = false,
    exposeErrors = !isProduction(),
    generateRequestId,
    traceId: externalTraceId,
    maxBodySize,
  }: RunHTTPWiringOptions = {}
): Promise<Out | void> => {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let result: Out

  const pikkuRequest =
    request instanceof Request
      ? new PikkuFetchHTTPRequest(request, { maxBodySize })
      : request

  let requestId: string | null = externalTraceId ?? null
  if (!requestId) {
    try {
      requestId = pikkuRequest.header('x-request-id')
    } catch {}
  }
  requestId = requestId || generateRequestId?.() || createWeakUID()

  const scopedLogger =
    singletonServices.logger.scope?.(requestId) ?? singletonServices.logger
  const http = createHTTPWire(pikkuRequest, response)
  const apiType = http!.request!.method()
  const apiRoute = http!.request!.path()

  const matchedRoute = getMatchingRoute(apiType, apiRoute)
  try {
    if (!matchedRoute) {
      if (apiType.toLowerCase() === 'options') {
        const httpGroups = pikkuState(null, 'middleware', 'httpGroup')
        const globalMiddleware = httpGroups['*']
        const wire = { http: http! } as unknown as PikkuWire
        if (globalMiddleware) {
          await runMiddleware(
            singletonServices,
            wire,
            globalMiddleware as CorePikkuMiddleware[]
          )
        }
        response.status(204).json(undefined as any)
        return
      }
      scopedLogger.info({
        message: 'Route not found',
        apiRoute,
        apiType,
      })
      throw new NotFoundError()
    }

    ;({ result } = await executeRoute(
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
    handleHTTPError(
      e,
      http,
      requestId,
      scopedLogger,
      logWarningsForStatusCodes,
      respondWith404,
      bubbleErrors,
      exposeErrors
    )
  }
}
