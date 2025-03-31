import { PikkuHTTPResponse } from '@pikku/core/http'
import type { SerializeOptions } from 'cookie'
import { cookies } from 'next/headers.js'

/**
 * The `PikkuActionNextResponse` class is an extension of the `PikkuHTTPAbstractResponse` class,
 * specifically designed for handling action responses in a Next.js environment.
 */
export class PikkuActionNextResponse extends PikkuHTTPResponse {
  private cookieStore: any

  /**
   * Constructs a new instance of the `PikkuActionNextRequest` class.
   */
  constructor(private dynamic: boolean) {
    super()
  }

  public async init() {
    if (this.dynamic) {
      this.cookieStore = await cookies()
    }
  }

  /**
   *
   * Sets the response header.
   *
   * @remarks
   * This method is currently a placeholder and should be implemented as needed.
   */
  public setRedirect(path: string, status: number) {
    throw new Error('Method not implemented.')
  }

  /**
   * Sets the status of the response.
   *
   * @remarks
   * This method is currently a placeholder and should be implemented as needed.
   */
  public setStatus() {}

  /**
   * Sets the response body as JSON.
   *
   * @remarks
   * This method is currently a placeholder and should be implemented as needed.
   */
  public setJson() {}

  /**
   * Sets the final response to be sent to the client.
   *
   * @remarks
   * This method is currently a placeholder and should be implemented as needed.
   */
  public setResponse() {}

  /**
   * Sets a cookie in the response.
   *
   * @param name - The name of the cookie.
   * @param value - The value of the cookie.
   * @param options - Options for setting the cookie.
   */
  public setCookie(
    name: string,
    value: string,
    options: SerializeOptions
  ): void {
    this.getCookieStore().set(name, value, options)
  }

  /**
   * Clears a cookie from the response.
   *
   * @param name - The name of the cookie to clear.
   */
  public clearCookie(name: string): void {
    this.getCookieStore().delete(name)
  }

  private getCookieStore() {
    if (!this.cookieStore) {
      if (!this.dynamic) {
        throw new Error('Need to allow dynamic optin for cookies')
      }
      if (!this.cookieStore) {
        throw new Error('init() needs to be called')
      }
    }
    return this.cookieStore
  }
}
