import { parse as parseQuery } from 'picoquery'
import { parse as parseCookie } from 'cookie'
import {
  HTTPMethod,
  PikkuHTTPRequest,
  PikkuQuery,
} from './http-routes.types.js'

/**
 * Abstract class representing a pikku request.
 * @template In - The type of the request body.
 * @group RequestResponse
 */
export class PikkuFetchHTTPRequest<In = unknown>
  implements PikkuHTTPRequest<In>
{
  #cookies: Partial<Record<string, string>> | undefined
  #params: Partial<Record<string, string | string[]>> = {}
  #url: URL

  constructor(private request: Request) {
    this.#url = new URL(request.url)
  }

  public method(): HTTPMethod {
    return this.request.method.toLowerCase() as HTTPMethod
  }

  public path(): string {
    return this.#url.pathname
  }

  /**
   * Retrieves the request body.
   * @returns A promise that resolves to the request body.
   */
  public json(): Promise<In> {
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
  public cookie(cookieName: string): string | null {
    const cookieHeader = this.header('cookie')
    this.#cookies = cookieHeader ? parseCookie(cookieHeader) : {}
    return this.#cookies[cookieName] || null
  }

  /**
   * Retrieves the request parameters.
   * @returns An object containing the request parameters.
   */
  public params(): Partial<Record<string, string | string[]>> {
    return this.#params
  }

  /**
   * Sets the request parameters.
   * @param params - An object containing the request parameters to set.
   */
  public setParams(
    params: Record<string, string | string[] | undefined>
  ): void {
    this.#params = params
  }

  /**
   * Retrieves the query parameters from the request.
   * @returns An object containing the query parameters.
   */
  public query(): PikkuQuery {
    return parseQuery(this.#url.searchParams.toString()) as PikkuQuery
  }

  /**
   * Retrieves the combined data from the request, including parameters, query, and body.
   * @returns A promise that resolves to an object containing the combined data.
   */
  public async data(): Promise<In> {
    let body: any = {}
    try {
      body = await this.json()
    } catch (e) {}

    return {
      ...this.params(),
      ...this.query(),
      // TODO: If body isn't an object, we should insert it as the word...
      ...body,
    }
  }
}
