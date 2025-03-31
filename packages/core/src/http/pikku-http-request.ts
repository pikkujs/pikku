import { parse as parseCookie } from 'cookie'
import { PikkuRequest } from '../pikku-request.js'
import { HTTPMethod, PikkuQuery } from './http-routes.types.js'

/**
 * Abstract class representing a pikku request.
 * @template In - The type of the request body.
 * @group RequestResponse
 */
export class PikkuHTTPRequest<In = unknown> extends PikkuRequest<In> {
  private _params: Partial<Record<string, string | string[]>> = {}
  private url: URL

  constructor(private request: Request) {
    super()
    this.url = new URL(request.url)
  }

  public method(): HTTPMethod {
    return this.request.method.toLowerCase() as HTTPMethod
  }

  public path(): string {
    return this.url.pathname
  }

  /**
   * Retrieves the request body.
   * @returns A promise that resolves to the request body.
   */
  public body(): Promise<In> {
    return this.request.json()
  }

  /**
   * Retrieves the raw request body as a Buffer.
   * @returns A promise that resolves to the raw request body.
   */
  public arrayBuffer(): Promise<ArrayBuffer> {
    return this.request.arrayBuffer()
  }

  /**
   * Retrieves the value of a specific header.
   * @param headerName - The name of the header to retrieve.
   * @returns The value of the header, or undefined if the header is not found.
   */
  public header(headerName: string): string | null {
    return this.request.headers.get(headerName.toLowerCase())
  }

  /**
   * Retrieves the cookies from the request.
   * @returns An object containing the cookies.
   */
  public cookies(): Partial<Record<string, string>> {
    const cookieHeader = this.header('cookie')
    if (cookieHeader) {
      return parseCookie(cookieHeader)
    }
    return {}
  }

  /**
   * Retrieves the request parameters.
   * @returns An object containing the request parameters.
   */
  public params(): Partial<Record<string, string | string[]>> {
    return this._params
  }

  /**
   * Sets the request parameters.
   * @param params - An object containing the request parameters to set.
   */
  public setParams(
    params: Record<string, string | string[] | undefined>
  ): void {
    this._params = params
  }

  /**
   * Retrieves the query parameters from the request.
   * @returns An object containing the query parameters.
   */
  public getQuery(): PikkuQuery {
    return {}
  }

  /**
   * Retrieves the combined data from the request, including parameters, query, and body.
   * @returns A promise that resolves to an object containing the combined data.
   */
  public async getData(): Promise<In> {
    return {
      ...this.params(),
      ...this.getQuery(),
      // TODO: If body isn't an object, we should insert it as the word...
      ...(await this.body()),
    }
  }
}
