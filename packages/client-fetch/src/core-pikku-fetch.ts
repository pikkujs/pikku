import { transformDates } from './transform-date.js'
import { corePikkuFetch } from './pikku-fetch.js'

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
 * @property {RequestInit['cache']} [cache] - The cache mode for the request.
 * @property {RequestInit['credentials']} [credentials] - The credentials mode for the request.
 * @property {RequestInit['mode']} [mode] - The mode for the request.
 */
export type CorePikkuFetchOptions = {
  transformDate?: boolean
  serverUrl?: string
  authHeaders?: AuthHeaders
} & Pick<RequestInit, 'cache' | 'credentials' | 'mode'>

/**
 * The `CorePikkuFetch` class provides a utility for making HTTP requests, including handling authorization,
 * transforming dates in responses, and managing server URLs. This class is designed to simplify API interactions
 * with configurable options and support for JWT and API key-based authentication.
 */
export class CorePikkuFetch {
  private authHeaders: AuthHeaders = {}

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
    }
    if (this.authHeaders.jwt) {
      headers.Authorization = `Bearer ${this.authHeaders.jwt}`
    } else if (this.authHeaders.apiKey) {
      headers['X-API-KEY'] = this.authHeaders.apiKey
    }
    return headers
  }

  /**
   * Sets the server URL for subsequent requests.
   *
   * @param {string} serverUrl - The server URL to be set.
   */
  public async setServerUrl(serverUrl: string): Promise<void> {
    if (serverUrl.endsWith('/')) {
      console.warn('Server URL should not end with a slash, removing.')
      serverUrl = serverUrl.slice(0, -1)
    }
    this.options.serverUrl = serverUrl
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
   * Makes an API request with the specified URI, method, and data, and optionally transforms dates in the response.
   *
   * @param {string} uri - The endpoint URI for the request.
   * @param {HTTPMethod} method - The HTTP method for the request.
   * @param {any} data - The data to be sent with the request.
   * @param {RequestInit} [options] - Additional options for the request.
   * @returns {Promise<any>} - A promise that resolves to the response data.
   * @throws {Response} - Throws the response if the status code is greater than 400.
   */
  public async api(
    uri: string,
    method: HTTPMethod,
    data: any,
    options?: RequestInit
  ) {
    const response = await this.fetch(uri, method, data, options)
    if (response.status >= 400) {
      throw response
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
    method: HTTPMethod,
    data: any,
    options?: RequestInit
  ) {
    this.verifyServerUrlSet()
    if (uri.startsWith('/')) {
      uri = `${this.options.serverUrl}${uri}`
    } else {
      uri = `${this.options.serverUrl}/${uri}`
    }

    return await corePikkuFetch(uri, data, {
      ...options,
      method,
      mode: this.options.mode,
      credentials: this.options.credentials,
      headers: { ...this.getHeaders(), ...options?.headers },
    })
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
    if (!this.options.transformDate) {
      return data
    }
    return transformDates(data)
  }
}
