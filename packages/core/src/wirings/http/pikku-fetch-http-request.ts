import { parse as parseQuery } from 'picoquery'
import { parse as parseCookie } from 'cookie'
import { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from './http.types.js'
import { UnprocessableContentError } from '../../errors/errors.js'

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
    if (this.#cookies?.[cookieName]) {
      return this.#cookies[cookieName]
    }
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
    const body = await this.body()
    const parts = [this.params(), this.query(), body]
    const merged: Record<string, unknown> = {}
    for (const part of parts) {
      for (const [key, value] of Object.entries(part)) {
        if (key in merged && !valuesAreEquivalent(merged[key], value)) {
          throw new UnprocessableContentError(
            `Conflicting values for key "${key}": "${merged[key]}" vs "${value}"`
          )
        }
        merged[key] ??= value
      }
    }
    return merged as In
  }

  private async body(): Promise<any> {
    const noBodyMethods: HTTPMethod[] = ['get', 'head', 'options', 'delete']
    if (noBodyMethods.includes(this.method())) {
      return {}
    }

    let body: any = {}
    const contentType = this.header('content-type') || ''
    try {
      if (contentType.includes('application/json')) {
        const parsed = await this.json()
        body =
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
            ? parsed
            : { data: parsed }
      } else if (contentType.includes('text/')) {
        const text = await this.request.text()
        body = { data: text }
      } else if (contentType.includes('application/octet-stream')) {
        const buffer = await this.request.arrayBuffer()
        body = { data: buffer }
      } else if (contentType === 'application/x-www-form-urlencoded') {
        const text = await this.request.text()
        body = Object.fromEntries(new URLSearchParams(text))
      } else {
        throw new UnprocessableContentError(
          `Unsupported content type ${contentType}`
        )
      }
    } catch (e) {
      throw new UnprocessableContentError(`Error parsing body: ${e}`)
    }
    return body
  }
}

function valuesAreEquivalent(a: unknown, b: unknown): boolean {
  return coerce(a) === coerce(b)
}

function coerce(value: unknown): string | number | boolean {
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
    const num = Number(value)
    return isNaN(num) ? value : num
  }
  return value as any
}
