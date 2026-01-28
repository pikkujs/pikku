import type { SerializeOptions } from 'cookie'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { PikkuError } from '../../errors/error-handler.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateWireServices,
  CorePikkuMiddleware,
  CommonWireMeta,
} from '../../types/core.types.js'
import type {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
  CorePermissionGroup,
  CorePikkuFunctionConfig,
} from '../../function/functions.types.js'

type ExtractHTTPWiringParams<S extends string> =
  S extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractHTTPWiringParams<`/${Rest}`>
    : S extends `${string}:${infer Param}`
      ? Param
      : never

export type AssertHTTPWiringParams<In, HTTPWiring extends string> =
  ExtractHTTPWiringParams<HTTPWiring> extends keyof In
    ? unknown
    : [
        'Error: HTTPWiring parameters',
        ExtractHTTPWiringParams<HTTPWiring>,
        'not in',
        keyof In,
      ]

export type RunHTTPWiringOptions = Partial<{
  skipUserSession: boolean
  respondWith404: boolean
  logWarningsForStatusCodes: number[]
  coerceDataFromSchema: boolean
  bubbleErrors: boolean
  generateRequestId: () => string
}>

export type RunHTTPWiringParams = {
  singletonServices: CoreSingletonServices
  createWireServices: CreateWireServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

/**
 * Represents the HTTP methods supported for API HTTP wirings.
 */
export type HTTPMethod =
  | 'post'
  | 'get'
  | 'delete'
  | 'patch'
  | 'head'
  | 'put'
  | 'options'

/**
 * Header schema configuration for a route.
 * Uses Standard Schema interface - works with Zod, Valibot, ArkType, Effect Schema, etc.
 */
export type HTTPHeadersConfig = {
  request?: StandardSchemaV1<Record<string, string | string[] | undefined>>
}

/**
 * Documentation config for OpenAPI generation
 */
export type HTTPRouteDocsConfig = {
  description?: string
  response?: string
  errors?: Array<typeof PikkuError>
  tags?: string[]
}

/**
 * Common HTTP route configuration shared between wireHTTP and wireHTTPRoutes
 */
export type HTTPRouteBaseConfig = {
  contentType?: 'xml' | 'json'
  timeout?: number
  tags?: string[]
  headers?: HTTPHeadersConfig
  docs?: HTTPRouteDocsConfig
}

/**
 * Represents an API HTTP wiring without a function, including metadata such as content type, route, and timeout settings.
 */
export type CoreHTTPFunction = HTTPRouteBaseConfig & {
  route: string
  eventChannel?: false
  returnsJSON?: false
}
/**
 * Represents a http wire within Pikku, including a request and response.
 */
export interface PikkuHTTP<In = unknown> {
  request?: PikkuHTTPRequest<In>
  response?: PikkuHTTPResponse
}

/**
 * Represents request headers as either a record or a function to get headers by name.
 */
export type RequestHeaders =
  | Record<string, string | string[] | undefined>
  | ((headerName: string) => string | string[] | undefined)

/**
 * Represents a query object for Pikku, where each key can be a string, a value, or an array of values.
 */
export type PikkuQuery<T = Record<string, string | undefined>> = Record<
  string,
  string | T | null | Array<T | null>
>

/**
 * Represents a core API HTTP wiring, which can have different configurations depending on whether it requires authentication and permissions.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template R - The route string type.
 * @template PikkuFunction - The API function type, defaults to `CorePikkuFunction`.
 * @template PikkuFunctionSessionless - The sessionless API function type, defaults to `CorePikkuFunctionSessionless`.
 * @template PikkuPermission - The permission function type, defaults to `CorePikkuPermission`.
 */
export type CoreHTTPFunctionWiring<
  In,
  Out,
  R extends string,
  PikkuFunction extends CorePikkuFunction<
    In,
    Out,
    any,
    any
  > = CorePikkuFunction<In, Out>,
  PikkuFunctionSessionless extends CorePikkuFunctionSessionless<
    In,
    Out,
    any,
    any
  > = CorePikkuFunctionSessionless<In, Out>,
  PikkuPermission extends CorePikkuPermission<
    In,
    any,
    any
  > = CorePikkuPermission<In, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware<
    any,
    any
  > = CorePikkuMiddleware<any>,
> =
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: CorePikkuFunctionConfig<
        PikkuFunction,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: CorePikkuFunctionConfig<
        PikkuFunctionSessionless,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: undefined
      auth?: false
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'get'
      func: CorePikkuFunctionConfig<
        PikkuFunction,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      middleware?: PikkuMiddleware[]
      sse?: boolean
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'get'
      func: CorePikkuFunctionConfig<
        PikkuFunctionSessionless,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: undefined
      auth?: false
      middleware?: PikkuMiddleware[]
      sse?: boolean
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: CorePikkuFunctionConfig<
        PikkuFunction,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      middleware?: PikkuMiddleware[]
      query?: Array<keyof In>
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: CorePikkuFunctionConfig<
        PikkuFunctionSessionless,
        PikkuPermission,
        PikkuMiddleware
      >
      permissions?: undefined
      auth?: false
      middleware?: PikkuMiddleware[]
      query?: Array<keyof In>
      sse?: undefined
    })
  | {
      /** Route triggers a workflow matched by route/method from workflow wires.http */
      route: R
      method: HTTPMethod
      workflow: true
      func?: undefined
      permissions?: undefined
      auth?: undefined
      tags?: undefined
      middleware?: undefined
      headers?: undefined
      returnsJSON?: undefined
      sse?: boolean
    }

/**
 * Represents the input types for HTTP wiring metadata, including parameters, query, and body types.
 */
export type HTTPFunctionMetaInputTypes = {
  params?: string
  query?: string
  body?: string
}

/**
 * Represents metadata for a set of HTTP wirings, including HTTP wiring details, methods, input/output types, and documentation.
 */
export type HTTPWiringMeta = CommonWireMeta & {
  route: string
  method: HTTPMethod
  params?: string[]
  query?: string[]
  inputTypes?: HTTPFunctionMetaInputTypes
  headersSchemaName?: string
  sse?: true
  workflow?: true
}
export type HTTPWiringsMeta = Record<HTTPMethod, Record<string, HTTPWiringMeta>>

export type HTTPFunctionsMeta = Array<{
  name: string
  inputs: string[] | null
  outputs: string[] | null
}>

export type HTTPWiringMiddleware = {
  route: string
  middleware: CorePikkuMiddleware[]
}

export interface PikkuHTTPRequest<In = unknown> {
  method(): HTTPMethod
  path(): string
  data(): Promise<In>
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
  header(headerName: string): string | null
  cookie(name?: string): string | null
  params(): Partial<Record<string, string | string[]>>
  setParams(params: Record<string, string | string[] | undefined>): void
  query(): PikkuQuery
}

export interface PikkuHTTPResponse<Out = unknown> {
  status(code: number): this
  cookie(name: string, value: string | null, options: SerializeOptions): this
  header(name: string, value: string | string[]): this
  arrayBuffer(
    data:
      | ArrayBuffer
      | ArrayBufferView
      | Blob
      | string
      | FormData
      | URLSearchParams
      | ReadableStream
  ): this
  json(data: Out): this
  redirect(location: string, status?: number): this
  close?: () => void
  setMode?: (mode: 'stream') => void
}

/**
 * Single route configuration - supports all wireHTTP options
 */
export type HTTPRouteConfig<
  PikkuFunction extends
    | CorePikkuFunction<any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any> =
    | CorePikkuFunction<any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<
    any,
    any,
    any
  > = CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
> = HTTPRouteBaseConfig & {
  // Required
  method: HTTPMethod
  route: string
  func: CorePikkuFunctionConfig<PikkuFunction, PikkuPermission, PikkuMiddleware>

  // Auth & permissions
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission>

  // Middleware
  middleware?: PikkuMiddleware[]

  // SSE support
  sse?: boolean
}

/**
 * Group-level configuration applied to all routes
 */
export type HTTPRoutesGroupConfig<
  PikkuPermission extends CorePikkuPermission<
    any,
    any,
    any
  > = CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
> = {
  basePath?: string
  tags?: string[]
  auth?: boolean
  middleware?: PikkuMiddleware[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

/**
 * Nested route map - allows hierarchical organization
 * Can contain individual routes, nested maps, or contracts with config
 */
export type HTTPRouteMap = {
  [key: string]: HTTPRouteConfig | HTTPRouteMap | HTTPRouteContract
}

/**
 * A route contract with optional group config (returned by defineRoutes)
 */
export type HTTPRouteContract<T extends HTTPRouteMap = HTTPRouteMap> =
  HTTPRoutesGroupConfig & {
    routes: T
  }

/**
 * Full configuration for wireHTTPRoutes
 */
export type WireHTTPRoutesConfig = HTTPRoutesGroupConfig & {
  routes: HTTPRouteMap | HTTPRouteConfig[]
}
