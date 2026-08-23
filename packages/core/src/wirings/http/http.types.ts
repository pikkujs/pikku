import type { SerializeOptions } from 'cookie'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
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
  /** How the body is serialised. Defaults to JSON; `xml` is for routes a caller you do not control insists on. */
  contentType?: 'xml' | 'json'
  /** Seconds before the request is abandoned. Work that can outlast a request should be dispatched instead, not given a longer timeout. */
  timeout?: number
  /** Filters this route in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** A schema the request headers are validated against, so a missing or malformed header fails before the function body runs. */
  headers?: HTTPHeadersSchema
}

export type CoreHTTPFunction = HTTPRouteBaseConfig & {
  route: string
  /** Sends the returned value as-is rather than JSON-encoding it, for a route whose body is binary or already serialised. */
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

/**
 * The keys every HTTP wiring takes, whatever it is wired to. The three that
 * are not here — `method`, `auth` and `func` — are correlated rather than
 * independent, and live in the unions below.
 */
type HTTPWiringShared<
  R extends string,
  PikkuMiddleware extends CorePikkuMiddleware<any, any>,
> = CoreHTTPFunction & {
  /**
   * The path this wiring answers on. `:name` marks a parameter, and every
   * parameter in the path must be a key of the function's input schema —
   * a mismatch is a compile error rather than a 404 at runtime.
   */
  route: R
  /** Wraps every request to this route: auth, tracing, rate limiting. Runs before the permissions on `func`. */
  middleware?: PikkuMiddleware[]
}

/**
 * `auth` decides which kind of function this route can point at, so the two
 * travel together: a route that requires a session gets a function that is
 * handed one, and an open route gets a sessionless function that has none to
 * read. Splitting them would let a function ask for a session the route never
 * establishes.
 */
type HTTPWiringAuth<
  In,
  Out,
  PikkuFunction extends CorePikkuFunction<In, Out, any, any, any>,
  PikkuFunctionSessionless extends CorePikkuFunctionSessionless<
    In,
    Out,
    any,
    any,
    any
  >,
  PikkuPermission extends CorePikkuPermission<In, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any>,
> =
  | {
      /** Whether reaching this route requires a session. Defaults to true — a route is closed unless it says otherwise. */
      auth?: true
      /** The function to run. It is handed the session this route required. */
      func: CorePikkuFunctionConfig<
        PikkuFunction,
        PikkuPermission,
        PikkuMiddleware
      >
    }
  | {
      /** Whether reaching this route requires a session. Defaults to true — a route is closed unless it says otherwise. */
      auth?: false
      /** On an open route there is no session, so this must be a sessionless function. */
      func: CorePikkuFunctionConfig<
        PikkuFunctionSessionless,
        PikkuPermission,
        PikkuMiddleware
      >
    }

/**
 * `sse` and `query` are each valid on one method only, so the method carries
 * them: streaming is a GET, and naming which input keys arrive in the query
 * string is only a question on a POST, where the rest of the input is a body.
 */
type HTTPWiringMethod<In> =
  | {
      /** The HTTP method. A route and method together address one wiring. */
      method: HTTPMethod
      sse?: undefined
    }
  | {
      /** The HTTP method. A route and method together address one wiring. */
      method: 'get'
      /** Streams the response as server-sent events instead of returning it once. GET only. */
      sse?: boolean
    }
  | {
      /** The HTTP method. A route and method together address one wiring. */
      method: 'post'
      /** Input keys that arrive in the query string rather than the body. POST only, where the body is the default home for input. */
      query?: Array<keyof In>
      sse?: undefined
    }

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
> = HTTPWiringShared<R, PikkuMiddleware> &
  HTTPWiringAuth<
    In,
    Out,
    PikkuFunction,
    PikkuFunctionSessionless,
    PikkuPermission,
    PikkuMiddleware
  > &
  HTTPWiringMethod<In>

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
