import type { Response as ExpressResponse } from 'express'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import { serialize as serializeCookie, type SerializeOptions } from 'cookie'

export class ExpressPikkuHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers: [string, string][] = []
  #body: string | Buffer | ArrayBuffer | undefined
  #ended = false

  constructor(private res: ExpressResponse) {}

  public status(code: number): this {
    this.#statusCode = code
    return this
  }

  public header(name: string, value: string | string[]): this {
    if (Array.isArray(value)) {
      for (const v of value) {
        this.#headers.push([name, v])
      }
    } else {
      this.#headers.push([name, value])
    }
    return this
  }

  public cookie(
    name: string,
    value: string | null,
    options: SerializeOptions
  ): this {
    this.#headers.push([
      'Set-Cookie',
      serializeCookie(name, value ?? '', options),
    ])
    return this
  }

  public json(data: unknown): this {
    this.#body = JSON.stringify(data)
    this.header('Content-Type', 'application/json')
    return this
  }

  public arrayBuffer(data: any): this {
    this.#body = data
    this.header('Content-Type', 'application/octet-stream')
    return this
  }

  public redirect(location: string, status: number = 302): this {
    if (
      !location.startsWith('/') &&
      !location.startsWith('https://') &&
      !location.startsWith('http://')
    ) {
      throw new Error(
        'Invalid redirect location: must be a relative path or absolute URL'
      )
    }
    this.#statusCode = status
    this.header('Location', location)
    return this
  }

  public close(): void {
    if (!this.#ended) {
      this.#ended = true
      this.res.end()
    }
  }

  public setMode(_mode: 'stream'): void {
    // Streaming not yet supported in native Express path
  }

  public flush(): void {
    if (this.#ended) return
    this.#ended = true
    this.res.status(this.#statusCode)
    for (const [name, value] of this.#headers) {
      this.res.append(name, value)
    }
    if (this.#body != null) {
      this.res.send(this.#body)
    } else {
      this.res.end()
    }
  }
}
