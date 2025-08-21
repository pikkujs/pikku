import type { SerializeOptions } from 'cookie'
import type { PikkuError } from '../../errors/error-handler.js'
import type {
  PikkuDocs,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
  CorePikkuMiddleware,
} from '../../types/core.types.js'
import type {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
  CorePermissionGroup,
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
  ignoreMiddleware: boolean
}>

export type RunHTTPWiringParams = {
  singletonServices: CoreSingletonServices
  createSessionServices: CreateSessionServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

/**
 * Represents the HTTP methods supported for API HTTP wirings.
t */
export type HTTPMethod =
  | 'post'
  | 'get'
  | 'delete'
  | 'patch'
  | 'head'
  | 'put'
  | 'options'

/**
 * Represents an API HTTP wiring without a function, including metadata such as content type, route, and timeout settings.
 */
export type CoreHTTPFunction = {
  contentType?: 'xml' | 'json'
  route: string
  eventChannel?: false
  returnsJSON?: false
  timeout?: number
  tags?: string[]
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
  PikkuFunction = CorePikkuFunction<In, Out>,
  PikkuFunctionSessionless = CorePikkuFunctionSessionless<In, Out>,
  PikkuPermission = CorePikkuPermission<In>,
  PikkuMiddleware = CorePikkuMiddleware,
> =
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: PikkuFunction
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      tags?: string[]
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: HTTPMethod
      func: PikkuFunctionSessionless
      permissions?: undefined
      auth?: false
      tags?: string[]
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'get'
      func: PikkuFunction
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      sse?: boolean
      tags?: string[]
      middleware?: PikkuMiddleware[]
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'get'
      func: PikkuFunctionSessionless
      permissions?: undefined
      auth?: false
      sse?: boolean
      tags?: string[]
      middleware?: PikkuMiddleware[]
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: PikkuFunction
      permissions?: CorePermissionGroup<PikkuPermission>
      auth?: true
      query?: Array<keyof In>
      tags?: string[]
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })
  | (CoreHTTPFunction & {
      route: R
      method: 'post'
      func: PikkuFunctionSessionless
      permissions?: undefined
      auth?: false
      query?: Array<keyof In>
      tags?: string[]
      middleware?: PikkuMiddleware[]
      sse?: undefined
    })

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
export type HTTPWiringMeta = {
  pikkuFuncName: string
  route: string
  method: HTTPMethod
  params?: string[]
  query?: string[]
  inputTypes?: HTTPFunctionMetaInputTypes
  docs?: PikkuDocs
  tags?: string[]
  sse?: true
}
export type HTTPWiringsMeta = Array<HTTPWiringMeta>

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

export interface PikkuHTTPResponse {
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
  json(data: unknown): this
  redirect(location: string, status?: number): this
  close?: () => void
  setMode?: (mode: 'stream') => void
}
