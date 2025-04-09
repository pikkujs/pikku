import { PikkuHTTPResponse } from './http-routes.types.js'
import {
  SerializeOptions as CookieSerializeOptions,
  serialize as serializeCookie,
} from 'cookie'

export class PikkuFetchHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers = new Headers()
  #cookies = new Map<string, { value: string; flags: CookieSerializeOptions }>()

  #body: BodyInit | null = null

  public status(code: number): this {
    this.#statusCode = code
    return this
  }

  public cookie(
    name: string,
    value: string,
    flags: CookieSerializeOptions
  ): this {
    this.#cookies.set(name, { value, flags })
    return this
  }

  public header(name: string, value: string | string[]): this {
    this.#headers.delete(name)
    if (Array.isArray(value)) {
      value.forEach((v) => this.#headers.append(name, v))
    } else {
      this.#headers.set(name, value)
    }
    return this
  }

  public arrayBuffer(data: XMLHttpRequestBodyInit): this {
    this.#body = data
    this.header('Content-Type', 'application/octet-stream')
    return this
  }

  public json(data: unknown): this {
    this.#body = JSON.stringify(data)
    this.header('Content-Type', 'application/json')
    return this
  }

  public text(content: string): this {
    this.#body = content
    this.header('Content-Type', 'text/plain')
    return this
  }

  public html(content: string): this {
    this.#body = content
    this.header('Content-Type', 'text/html')
    return this
  }

  public body(body: BodyInit): this {
    this.#body = body
    return this
  }

  public redirect(location: string, status: number = 302): this {
    this.#statusCode = status
    this.header('Location', location)
    return this
  }

  public toResponse(args?: Record<string, any>): Response {
    const cookieHeader = Array.from(this.#cookies.entries()).map(
      ([name, { value, flags }]) => serializeCookie(name, value, flags)
    )
    this.#headers.set('Set-Cookie', cookieHeader.join(', '))
    return new Response(this.#body, {
      ...args,
      status: this.#statusCode,
      headers: this.#headers,
    })
  }
}
