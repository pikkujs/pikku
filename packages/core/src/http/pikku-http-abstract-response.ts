import { SerializeOptions, serialize } from 'cookie'
import { JSONValue } from '../types/core.types.js'
import { PikkuResponse } from '../pikku-response.js'

/**
 * Abstract class representing a pikku response.
 * @group RequestResponse
 */
export abstract class PikkuHTTPAbstractResponse extends PikkuResponse {
  /**
   * Sets the HTTP status code for the response.
   * @param status - The HTTP status code to set.
   */
  public abstract setStatus(status: number): void

  /**
   * Sets the JSON body for the response.
   * @param body - The JSON body to set.
   */
  public abstract setJson(body: JSONValue): void

  /**
   * Sets the response content.
   * @param response - The response content, which can be a string or a Buffer.
   */
  public abstract setResponse(response: string | Buffer): void

  /**
   * Sets a header for the response.
   * @param name - The name of the header.
   * @param value - The value of the header, which can be a string, boolean, or an array of strings.
   */
  public setHeader(name: string, value: string | boolean | string[]) {
    throw new Error('Method not implemented.')
  }

  /**
   * Sets multiple headers for the response.
   * @param headers - An object containing header names and values.
   */
  public setHeaders(headers: Record<string, string>) {
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value)
    }
  }

  /**
   * Sets a cookie for the response.
   * @param name - The name of the cookie.
   * @param value - The value of the cookie.
   * @param options - Options for cookie serialization.
   */
  public setCookie(name: string, value: string, options: SerializeOptions) {
    this.setHeader('set-cookie', serialize(name, value, options))
  }

  /**
   * Clears a cookie from the response.
   * @param name - The name of the cookie to clear.
   */
  public clearCookie(name: string): void {
    this.setHeader('set-cookie', serialize(name, '', { expires: new Date(0) }))
  }

  /**
   * Sets a redirect for the response.
   * @param path - The path to redirect to.
   * @param status - The HTTP status code for the redirect.
   */
  public setRedirect(path: string, status: number) {
    throw new Error('Method not implemented.')
  }

  /**
   * Informs the response that it has ended, useful for when setting
   * a status without a body or response.
   */
  public end() {}
}
