import { SerializeOptions } from 'cookie'
import { PikkuError } from '../errors/error-handler.js'
import {
  APIDocs,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
  PikkuMiddleware,
} from '../types/core.types.js'
import {
  CoreAPIFunction,
  CoreAPIFunctionSessionless,
  CoreAPIPermission,
} from '../types/functions.types.js'

type ExtractRouteParams<S extends string> =
  S extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractRouteParams<`/${Rest}`>
    : S extends `${string}:${infer Param}`
      ? Param
      : never

export type AssertRouteParams<In, Route extends string> =
  ExtractRouteParams<Route> extends keyof In
    ? unknown
    : ['Error: Route parameters', ExtractRouteParams<Route>, 'not in', keyof In]

export type RunRouteOptions = Partial<{
  skipUserSession: boolean
  respondWith404: boolean
  logWarningsForStatusCodes: number[]
  coerceDataFromSchema: boolean
  bubbleErrors: boolean
}>

export type RunRouteParams = {
  singletonServices: CoreSingletonServices
  createSessionServices: CreateSessionServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

/**
 * Represents the HTTP methods supported for API routes.
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
 * Represents an API route without a function, including metadata such as content type, route, and timeout settings.
 */
export type CoreHTTPFunction = {
  contentType?: 'xml' | 'json'
  route: string
  eventChannel?: false
  returnsJSON?: false
  timeout?: number
  docs?: Partial<{
    description: string
    response: string
    errors: Array<typeof PikkuError>
    tags: string[]
  }>
}
/**
 * Represents a http interaction within Pikku, including a request and response.
 */
export interface PikkuHTTP {
  request?: PikkuHTTPRequest
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
 * Represents a core API route, which can have different configurations depending on whether it requires authentication and permissions.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template R - The route string type.
 * @template APIFunction - The API function type, defaults to `CoreAPIFunction`.
 * @template APIFunctionSessionless - The sessionless API function type, defaults to `CoreAPIFunctionSessionless`.
 * @template APIPermission - The permission function type, defaults to `CoreAPIPermission`.
 */
export type CoreHTTPFunctionRoute<
  In,
  Out,
  R extends string,
  APIFunction = CoreAPIFunction<In, Out>,
  APIFunctionSessionless = CoreAPIFunctionSessionless<In, Out>,
  APIPermission = CoreAPIPermission<In>,
  APIMiddleware = PikkuMiddleware,
> =
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: APIFunction
      permissions?: Record<string, APIPermission[] | APIPermission>
      auth?: true
      tags?: string[]
      middleware?: APIMiddleware[]
    })
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: APIFunctionSessionless
      permissions?: undefined
      auth?: false
      tags?: string[]
      middleware?: APIMiddleware[]
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: APIFunction
      permissions?: Record<string, APIPermission[] | APIPermission>
      auth?: true
      query?: Array<keyof In>
      tags?: string[]
      middleware?: APIMiddleware[]
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: APIFunctionSessionless
      permissions?: undefined
      auth?: false
      query?: Array<keyof In>
      tags?: string[]
      middleware?: APIMiddleware[]
    })

/**
 * Represents an array of core API routes.
 */
export type CoreHTTPFunctionRoutes = Array<
  CoreHTTPFunctionRoute<any, any, string>
>

/**
 * Represents the input types for route metadata, including parameters, query, and body types.
 */
export type HTTPFunctionMetaInputTypes = {
  params?: string
  query?: string
  body?: string
}

/**
 * Represents metadata for a set of routes, including route details, methods, input/output types, and documentation.
 */
export type HTTPRoutesMeta = Array<{
  route: string
  method: HTTPMethod
  params?: string[]
  query?: string[]
  input: string | null
  output: string | null
  inputTypes?: HTTPFunctionMetaInputTypes
  docs?: APIDocs
  tags?: string[]
}>

export type HTTPRouteMiddleware = {
  route: string
  middleware: PikkuMiddleware[]
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

export interface PikkuHTTPResponse {
  status(code: number): this
  cookie(name: string, value: string | null, options: SerializeOptions): this
  header(name: string, value: string | string[]): this
  arrayBuffer(data: XMLHttpRequestBodyInit): this
  json(data: unknown): this
  redirect(location: string, status?: number): this
}
