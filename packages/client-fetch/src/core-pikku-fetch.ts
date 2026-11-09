import { transformDates } from './transform-date.js'
import { corePikkuFetch } from './pikku-fetch.js'
import { PikkuFetchError } from './pikku-fetch-error.js'
import { readServerEvents } from './server-events.js'
import {
  PikkuAgentStreamError,
  type PikkuAgentEvent,
  type PikkuAgentStreamOptions,
} from './agent-events.js'

type AuthHeaders = {
  jwt?: string
  apiKey?: string
}

export type HTTPMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD' | 'PUT'

/**
 * Options for configuring the `CorePikkuFetch` utility.
 *
 * @typedef {Object} CorePikkuFetchOptions
 * @property {boolean} [transformDate] - Whether to transform date-like strings in the response to `Date` objects.
 * @property {string} [serverUrl] - The base server URL for requests.
 * @property {AuthHeaders} [authHeaders] - Authorization headers, including JWT or API key.
 * @property {typeof globalThis.fetch} [fetch] - A fetch implementation to use instead of the global one.
 * @property {RequestInit['cache']} [cache] - The cache mode for the request.
 * @property {RequestInit['credentials']} [credentials] - The credentials mode for the request.
 * @property {RequestInit['mode']} [mode] - The mode for the request.
 */
export type CorePikkuFetchOptions = {
  transformDate?: boolean
  serverUrl?: string
  authHeaders?: AuthHeaders
  fetch?: typeof globalThis.fetch
} & Pick<RequestInit, 'cache' | 'credentials' | 'mode'>

/**
 * The `CorePikkuFetch` class provides a utility for making HTTP requests, including handling authorization,
 * transforming dates in responses, and managing server URLs. This class is designed to simplify API wires
 * with configurable options and support for JWT and API key-based authentication.
 */
export class CorePikkuFetch {
  private authHeaders: AuthHeaders = {}
  private extraHeaders: Record<string, string> = {}

  /**
   * Constructs a new instance of the `CorePikkuFetch` class.
   *
   * @param {CorePikkuFetchOptions} options - Optional configuration for the fetch utility.
   */
  constructor(private options: CorePikkuFetchOptions = {}) {
    this.authHeaders = options.authHeaders || {}
  }

  /**
   * Generates the headers for the request, including authorization headers if set.
   *
   * @returns {Record<string, string>} - The headers for the request.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    }
    if (this.authHeaders.jwt) {
      headers.Authorization = `Bearer ${this.authHeaders.jwt}`
    } else if (this.authHeaders.apiKey) {
      headers['X-API-KEY'] = this.authHeaders.apiKey
    }
    return headers
  }

  public setHeader(name: string, value: string | null): void {
    if (value === null) {
      delete this.extraHeaders[name]
    } else {
      this.extraHeaders[name] = value
    }
  }

  /**
   * Sets the server URL for subsequent requests.
   *
   * @param {string} serverUrl - The server URL to be set.
   */
  public setServerUrl(serverUrl: string): void {
    if (serverUrl.endsWith('/')) {
      console.warn('Server URL should not end with a slash, removing.')
      serverUrl = serverUrl.slice(0, -1)
    }
    this.options.serverUrl = serverUrl
  }

  /**
   * Returns the configured base server URL (without trailing slash), or
   * undefined if it hasn't been set yet.
   */
  public getServerUrl(): string | undefined {
    return this.options.serverUrl
  }

  /**
   * Sets the JWT for authorization.
   *
   * @param {string} jwt - The JWT to be used for authorization.
   */
  public setAuthorizationJWT(jwt: string | null): void {
    if (jwt) {
      this.authHeaders.jwt = jwt
    } else {
      delete this.authHeaders.jwt
    }
  }

  /**
   * Sets the API key for authorization.
   *
   * @param {string} [apiKey] - The API key to be used for authorization.
   */
  public setAPIKey(apiKey: string | null): void {
    if (apiKey) {
      this.authHeaders.apiKey = apiKey
    } else {
      delete this.authHeaders.apiKey
    }
  }

  public async post(uri: string, data: any, options?: RequestInit) {
    return await this.api(uri, 'POST', data, options)
  }

  public async get(uri: string, data: any, options?: RequestInit) {
    return await this.api(uri, 'GET', data, options)
  }

  public async patch(uri: string, data: any, options?: RequestInit) {
    return await this.api(uri, 'PATCH', data, options)
  }

  public async head(uri: string, data: any, options?: RequestInit) {
    return await this.api(uri, 'HEAD', data, options)
  }

  /**
   * Uploads a file to a URL obtained from `getUploadURL`.
   * Handles both presigned URLs (e.g. S3) and header-based auth (e.g. B2).
   *
   * @param {Object} uploadInfo - The result from the backend's `getUploadURL` call.
   * @param {string} uploadInfo.uploadUrl - The URL to upload to.
   * @param {string} uploadInfo.assetKey - The finalized asset key.
   * @param {Record<string, string>} [uploadInfo.uploadHeaders] - Optional headers required by the storage backend.
   * @param {Blob | File | Buffer | ReadableStream} body - The file content to upload.
   * @param {string} [contentType] - The MIME type (used as fallback if not in uploadHeaders).
   * @returns {Promise<{ assetKey: string; response: Response }>} - The asset key and raw response.
   */
  public async uploadFile(
    uploadInfo: {
      uploadUrl: string
      assetKey: string
      uploadHeaders?: Record<string, string>
      uploadMethod?: 'PUT' | 'POST'
    },
    body: Blob | File | BufferSource | ReadableStream,
    contentType?: string
  ): Promise<{ assetKey: string; response: Response }> {
    const headers: Record<string, string> = {
      ...uploadInfo.uploadHeaders,
    }
    if (!headers['Content-Type'] && contentType) {
      headers['Content-Type'] = contentType
    }

    const response = await fetch(uploadInfo.uploadUrl, {
      method: uploadInfo.uploadMethod ?? 'PUT',
      headers,
      body: body as any,
    })

    if (response.status >= 400) {
      throw await PikkuFetchError.fromResponse(response)
    }

    return { assetKey: uploadInfo.assetKey, response }
  }

  /**
   * Makes an API request with the specified URI, method, and data, and optionally transforms dates in the response.
   *
   * @param {string} uri - The endpoint URI for the request.
   * @param {HTTPMethod} method - The HTTP method for the request.
   * @param {any} data - The data to be sent with the request.
   * @param {RequestInit} [options] - Additional options for the request.
   * @returns {Promise<any>} - A promise that resolves to the response data.
   * @throws {PikkuFetchError} - Throws a decoded error if the status code is >= 400.
   */
  public async api(
    uri: string,
    method: HTTPMethod,
    data: any,
    options?: RequestInit
  ) {
    const response = await this.fetch(uri, method, data, options)
    if (response.status >= 400) {
      throw await PikkuFetchError.fromResponse(response)
    }
    try {
      const result = await response.json()
      return this.transformDates(result)
    } catch {
      // TODO: If it doesn't return anything..
      return
    }
  }

  /**
   * Opens an SSE stream to the given path and calls `handler` for each parsed
   * JSON event. Returns a handle with a `close()` method that aborts the stream.
   *
   * @param path - Server-relative path (e.g. `/workflow-run/:runId/stream`)
   * @param handler - Called with each decoded JSON event
   * @param onError - Called once if the stream errors (and is not already closed)
   */
  public subscribeToSSE<T = unknown>(
    path: string,
    handler: (event: T) => void,
    onError?: (err: unknown) => void
  ): { close: () => void } {
    this.verifyServerUrlSet()
    const url = path.startsWith('/')
      ? `${this.options.serverUrl}${path}`
      : `${this.options.serverUrl}/${path}`

    const controller = new AbortController()
    let closed = false

    const run = async () => {
      try {
        const response = await corePikkuFetch(
          url,
          null,
          {
            method: 'GET',
            mode: this.options.mode,
            credentials: this.options.credentials,
            headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
            signal: controller.signal,
          },
          this.options.fetch
        )
        if (!response.ok || !response.body) {
          throw new Error(`SSE request failed: ${response.status}`)
        }
        for await (const event of readServerEvents<T>(response.body, 'skip')) {
          if (closed) break
          handler(event)
        }
        // Clean EOF before caller called close() = unexpected stream termination.
        if (!closed) throw new Error('SSE stream closed unexpectedly')
      } catch (err) {
        if (!closed) onError?.(err)
      }
    }

    // run() catches every error internally and routes it to onError
    void run()
    return {
      close: () => {
        closed = true
        controller.abort()
      },
    }
  }

  /**
   * POSTs `data` and reads the reply as a server-event stream, yielding the JSON in each
   * `data:` frame. A status of 400 or above throws a `PikkuFetchError` before anything is
   * yielded, and a frame that is not JSON throws rather than being skipped.
   *
   * @param uri - The endpoint URI for the request.
   * @param data - The JSON body.
   * @param options - Request options; pass `signal` to abort the stream.
   */
  public async *postStream<T = unknown>(
    uri: string,
    data: unknown,
    options?: RequestInit
  ): AsyncGenerator<T, void, undefined> {
    // Headers, [name, value] tuples and plain objects all spread differently.
    const headers = Object.fromEntries(new Headers(options?.headers).entries())
    const response = await this.fetch(uri, 'POST', data, {
      ...options,
      headers: { ...headers, accept: 'text/event-stream' },
    })
    if (response.status >= 400) {
      throw await PikkuFetchError.fromResponse(response)
    }
    if (!response.body) {
      throw new Error(`Stream request to ${uri} returned no body`)
    }
    for await (const event of readServerEvents<T>(response.body)) {
      // A chunk can hold several frames: stop at the abort, not after the chunk.
      options?.signal?.throwIfAborted()
      yield event
    }
  }

  /**
   * Runs an agent over `POST /rpc/agent/:agentName/stream` and yields its AG-UI events,
   * ending with `RUN_FINISHED`. A `RUN_ERROR` frame throws a `PikkuAgentStreamError`
   * carrying the server's message, and so does a stream that ends before `RUN_FINISHED`.
   *
   * @param uri - The stream route, with the agent name already in it.
   * @param input - The agent input (`message`, `threadId`, `resourceId`, ...).
   * @param options - Pass `signal` to abort the run's stream.
   */
  public async *agentStream(
    uri: string,
    input: unknown,
    options?: PikkuAgentStreamOptions
  ): AsyncGenerator<PikkuAgentEvent, void, undefined> {
    const events = this.postStream<
      PikkuAgentEvent | { type: 'RUN_ERROR'; message: string; code?: string }
    >(uri, input, { signal: options?.signal })
    for await (const event of events) {
      if (event.type === 'RUN_ERROR') {
        throw new PikkuAgentStreamError(event.message, event.code)
      }
      yield event
      if (event.type === 'RUN_FINISHED') return
    }
    throw new PikkuAgentStreamError('Agent stream ended before RUN_FINISHED')
  }

  /**
   * Makes a raw fetch request with the specified URI, method, and data.
   *
   * @param {string} uri - The endpoint URI for the request.
   * @param {HTTPMethod} method - The HTTP method for the request.
   * @param {any} data - The data to be sent with the request.
   * @param {RequestInit} [options] - Additional options for the request.
   * @returns {Promise<Response>} - A promise that resolves to the fetch response.
   */
  public async fetch(
    uri: string,
    method: any, // HTTPMethod, TODO: the generated file is a subset of HTTPMethod
    data: any,
    options?: RequestInit
  ) {
    this.verifyServerUrlSet()
    if (uri.startsWith('/')) {
      uri = `${this.options.serverUrl}${uri}`
    } else {
      uri = `${this.options.serverUrl}/${uri}`
    }

    return await corePikkuFetch(
      uri,
      data,
      {
        ...options,
        method,
        mode: this.options.mode,
        credentials: this.options.credentials,
        headers: { ...this.getHeaders(), ...options?.headers },
      },
      this.options.fetch
    )
  }

  /**
   * Verifies that the server URL is set before making a request.
   *
   * @throws {Error} - Throws an error if the server URL is not set.
   */
  private verifyServerUrlSet() {
    if (!this.options.serverUrl) {
      throw new Error('Server url is not set')
    }
  }

  /**
   * Transforms date-like strings in the response data into `Date` objects if the `transformDate` option is set.
   *
   * @param {any} data - The data to transform.
   * @returns {any} - The transformed data.
   */
  private transformDates(data: any): any {
    if (this.options.transformDate === false) {
      return data
    }
    return transformDates(data)
  }
}
