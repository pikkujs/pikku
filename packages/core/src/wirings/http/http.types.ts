import type { SerializeOptions } from 'cookie'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  CorePikkuMiddleware,
  CommonWireMeta,
} from '../../types/core.types.js'
import type {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
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
  exposeErrors: boolean
  generateRequestId: () => string
  /** Pre-resolved trace ID (e.g. CF-Ray). Falls back to x-request-id header or generated ID. */
  traceId: string
  /** Maximum request body size in bytes, applied when pikku wraps a fetch `Request`. */
  maxBodySize: number
}>

export type HTTPMethod =
  'post' | 'get' | 'delete' | 'patch' | 'head' | 'put' | 'options'

export type HTTPHeadersSchema = StandardSchemaV1<
  Record<string, string | string[] | undefined>
>

export type HTTPRouteBaseConfig = {
  contentType?: 'xml' | 'json'
  timeout?: number
  tags?: string[]
  headers?: HTTPHeadersSchema
}

export type CoreHTTPFunction = HTTPRouteBaseConfig & {
  route: string
  eventChannel?: false
  returnsJSON?: false
}

export interface PikkuHTTP<In = unknown> {
  request?: PikkuHTTPRequest<In>
  response?: PikkuHTTPResponse
}

export type PikkuQuery<T = Record<string, string | undefined>> = Record<
  string,
  string | T | null | Array<T | null>
>

export type CoreHTTPFunctionWiring<
  In,
  Out,
  R extends string,
  PikkuFunction extends CorePikkuFunction<In, Out, any, any, any> =
    CorePikkuFunction<In, Out>,
  PikkuFunctionSessionless extends CorePikkuFunctionSessionless<
    In,
    Out,
    any,
    any,
    any
  > = CorePikkuFunctionSessionless<In, Out>,
  PikkuPermission extends CorePikkuPermission<In, any, any> =
    CorePikkuPermission<In, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
> =
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: CorePikkuFunctionConfig<
        PikkuFunction,
        PikkuPermission,
        PikkuMiddleware
      >
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
      auth?: false
      middleware?: PikkuMiddleware[]
      query?: Array<keyof In>
      sse?: undefined
    })

export type HTTPFunctionMetaInputTypes = {
  params?: string
  query?: string
  body?: string
}

export type HTTPWiringMeta = CommonWireMeta & {
  route: string
  method: HTTPMethod
  /** The route's own `auth`, or the group's if the route did not set one. */
  auth?: boolean
  /**
   * Whether reaching this route requires a session, resolved at codegen time
   * across every layer that can demand one: the function's `sessionless`, its
   * own `auth`, this route's `auth`, and the auth flag of the addon the
   * function belongs to. Answering "which routes are open?" used to mean
   * joining four separate places and knowing which of them wins; getting that
   * join wrong reads an open route as a closed one.
   */
  requiresSession?: boolean
  refTarget?: string
  params?: string[]
  query?: string[]
  inputTypes?: HTTPFunctionMetaInputTypes
  headersSchemaName?: string
  sse?: true
  groupBasePath?: string
}
export type HTTPWiringsMeta = Record<HTTPMethod, Record<string, HTTPWiringMeta>>

export interface PikkuHTTPRequest<In = unknown> {
  method(): HTTPMethod
  path(): string
  data(): Promise<In>
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
  headers(): Record<string, string>
  header(headerName: string): string | null
  cookie(name?: string): string | null
  params(): Partial<Record<string, string | string[]>>
  setParams(params: Record<string, string | string[] | undefined>): void
  query(): PikkuQuery
}

export interface PikkuHTTPResponse<Out = unknown> {
  readonly statusCode: number
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
  /** `ArrayBufferView` covers `Buffer` and `Uint8Array`, which is how a body
   *  that is not text reaches here without being decoded on the way. */
  send?(data: string | ArrayBuffer | ArrayBufferView): this
  redirect(location: string, status?: number): this
  close?: () => void
  setMode?: (mode: 'stream') => void
  flushHeaders?: () => void
}

export type HTTPRouteConfig<
  PikkuFunction extends
    | CorePikkuFunction<any, any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any, any> =
    | CorePikkuFunction<any, any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<any, any, any> =
    CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
> = HTTPRouteBaseConfig & {
  method: HTTPMethod
  route: string
  func: CorePikkuFunctionConfig<PikkuFunction, PikkuPermission, PikkuMiddleware>
  auth?: boolean
  middleware?: PikkuMiddleware[]
  sse?: boolean
}

export type HTTPRoutesGroupConfig<
  PikkuPermission extends CorePikkuPermission<any, any, any> =
    CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
> = {
  basePath?: string
  tags?: string[]
  auth?: boolean
  middleware?: PikkuMiddleware[]
}

export type HTTPRouteMap = {
  [key: string]: HTTPRouteConfig | HTTPRouteMap | HTTPRouteContract
}

export type HTTPRouteContract<T extends HTTPRouteMap = HTTPRouteMap> =
  HTTPRoutesGroupConfig & {
    routes: T
  }

export type WireHTTPRoutesConfig = HTTPRoutesGroupConfig & {
  routes: HTTPRouteMap | HTTPRouteConfig[]
}
