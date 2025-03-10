import { HTTPMethod, PikkuHTTPAbstractRequest } from '@pikku/core'
import { NextRequest } from 'next/server.js'

/**
 * The `PikkuNextRequest` class is an extension of the `PikkuHTTPAbstractRequest` class,
 * specifically designed for handling requests in a Next.js server environment.
 */
export class PikkuNextRequest extends PikkuHTTPAbstractRequest {
  /**
   * Constructs a new instance of the `PikkuNextRequest` class.
   *
   * @param request - The Next.js request object to be wrapped.
   */
  constructor(private request: NextRequest) {
    super(request.url, request.method.toLowerCase() as HTTPMethod)
  }

  /**
   * Retrieves the cookies from the request.
   *
   * @returns An object containing the cookies.
   */
  public getCookies() {
    return this.request.cookies
      .getAll()
      .reduce<Record<string, string>>((acc, cookie) => {
        acc[cookie.name] = cookie.value
        return acc
      }, {})
  }

  /**
   * Retrieves the value of a specific header from the request.
   *
   * @param headerName - The name of the header to retrieve.
   * @returns The value of the specified header, or `undefined` if not found.
   */
  public getHeader(headerName: string): string | undefined {
    return this.request.headers.get(headerName) || undefined
  }

  /**
   * Throws an error because the Next.js request does not have a body.
   *
   * @throws An error indicating that the body is not available.
   */
  public async getBody() {
    throw new Error("NextJS Request doesn't have a body")
  }
}
