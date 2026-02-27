import type { HttpResponse } from 'uWebSockets.js'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import { serialize as serializeCookie, type SerializeOptions } from 'cookie'

export class UWSPikkuHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers: [string, string][] = []
  #body: string | ArrayBuffer | Buffer | undefined
  #ended = false

  constructor(
    private res: HttpResponse,
    private isAborted: () => boolean
  ) {}

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
    if (!this.#ended && !this.isAborted()) {
      this.#ended = true
      this.res.cork(() => {
        this.res.end()
      })
    }
  }

  public setMode(_mode: 'stream'): void {
    // Streaming not yet supported in native uWS path
  }

  public flush(): void {
    if (this.#ended || this.isAborted()) return
    this.#ended = true
    this.res.cork(() => {
      this.res.writeStatus(this.#statusCode.toString())
      for (const [name, value] of this.#headers) {
        this.res.writeHeader(name, value)
      }
      if (this.#body != null) {
        this.res.end(this.#body as any)
      } else {
        this.res.endWithoutBody()
      }
    })
  }
}
