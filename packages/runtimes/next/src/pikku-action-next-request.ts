import { HTTPMethod } from '@pikku/core'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'
import { cookies, headers } from 'next/headers.js'

/**
 * The `PikkuActionNextRequest` class is an extension of the `PikkuHTTPAbstractRequest` class,
 * specifically designed for handling action requests in a Next.js environment.
 */
export class PikkuActionNextRequest<In> extends PikkuHTTPAbstractRequest<In> {
  private body: any
  private cookies: Record<string, string> | undefined
  private headers: Map<string, string> | undefined

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
    super(route, method)
    // Needed to convert the body to a plain object and validate dates
    this.body = JSON.parse(JSON.stringify(body))
  }

  public async init() {
    if (this.dynamic) {
      const cookieStore = await cookies()
      const allCookies = cookieStore.getAll()
      this.cookies = allCookies.reduce<Record<string, string>>(
        (result, { name, value }) => {
          result[name] = value
          return result
        },
        {}
      )

      const headerStore = await headers()
      this.headers = new Map()
      for (const [key, value] of (headerStore as any).entries()) {
        this.headers.set(key, value)
      }
    }
  }

  /**
   * Retrieves the cookies from the request.
   *
   * @returns An object containing the cookies.
   */
  public getCookies() {
    if (!this.dynamic) {
      throw new Error('Need to allow dynamic option for cookies')
    }
    if (!this.cookies) {
      throw new Error('Init first needs to be called')
    }
    return this.cookies
  }

  /**
   * Retrieves the value of a specific header from the request.
   *
   * @param headerName - The name of the header to retrieve.
   * @returns The value of the specified header, or `undefined` if not found.
   */
  public getHeader(headerName: string): string | undefined {
    if (!this.dynamic) {
      throw new Error('Need to allow dynamic option for cookies')
    }
    if (!this.headers) {
      throw new Error('Init first needs to be called')
    }
    return this.headers.get(headerName)
  }

  /**
   * Retrieves the body of the request.
   *
   * @returns The body of the request.
   */
  public getBody() {
    return this.body
  }
}
