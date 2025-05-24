import { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from '@pikku/core'
import { cookies, headers } from 'next/headers.js'

/**
 * The `PikkuActionNextRequest` class is an extension of the `PikkuHTTPAbstractRequest` class,
 * specifically designed for handling action requests in a Next.js environment.
 */
export class PikkuActionNextRequest<In> implements PikkuHTTPRequest<In> {
  #body: any
  #headers: Map<string, string> | undefined
  #method: HTTPMethod
  #route: string
  cookieStore: any

  /**
   * Constructs a new instance of the `PikkuActionNextRequest` class.
   *
   * @param body - The request body to be wrapped and converted to a plain object.
   */
  constructor(
    route: string,
    method: HTTPMethod,
    body: any,
    private dynamic: boolean
  ) {
    this.#route = route
    this.#method = method
    // Needed to convert the body to a plain object and validate dates
    this.#body = JSON.parse(JSON.stringify(body))
  }

  method(): HTTPMethod {
    return this.#method
  }

  path(): string {
    return this.#route
  }

  json(): Promise<unknown> {
    return this.#body
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error("Next Response doesn't support arrayBuffer")
  }

  params(): Partial<Record<string, string | string[]>> {
    return this.#body
  }

  setParams(_params: Record<string, string | string[] | undefined>): void {
    // This is a no-op since params are merged into data already
  }

  query(): PikkuQuery {
    return this.#body
  }

  public async init() {
    if (this.dynamic) {
      this.cookieStore = await cookies()
      const headerStore = await headers()
      this.#headers = new Map()
      for (const [key, value] of (headerStore as any).entries()) {
        this.#headers.set(key, value)
      }
    }
  }

  /**
   * Retrieves the cookies from the request.
   *
   * @returns An object containing the cookies.
   */
  public cookie(cookieName: string): string | null {
    if (!this.dynamic) {
      throw new Error('Need to allow dynamic option for cookies')
    }
    if (!this.cookieStore) {
      throw new Error('Init first needs to be called')
    }
    return this.cookieStore.get(cookieName).value || null
  }

  /**
   * Retrieves the value of a specific header from the request.
   *
   * @param headerName - The name of the header to retrieve.
   * @returns The value of the specified header, or `undefined` if not found.
   */
  public header(headerName: string): string | null {
    if (!this.dynamic) {
      throw new Error('Need to allow dynamic option for cookies')
    }
    if (!this.#headers) {
      throw new Error('Init first needs to be called')
    }
    return this.#headers.get(headerName) || null
  }

  /**
   * Retrieves the body of the request.
   *
   * @returns The body of the request.
   */
  public data() {
    return this.#body
  }
}
