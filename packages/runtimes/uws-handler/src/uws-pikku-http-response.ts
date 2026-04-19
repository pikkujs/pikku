import type { HttpResponse } from 'uWebSockets.js'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import { serialize as serializeCookie, type SerializeOptions } from 'cookie'

export class UWSPikkuHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers: [string, string][] = []
  #body: string | ArrayBuffer | Buffer | undefined
  #ended = false
  #streaming = false
  #headersSent = false
  #pendingChunks: string[] = []

  constructor(
    private res: HttpResponse,
    private isAborted: () => boolean
  ) {}

  public get statusCode(): number {
    return this.#statusCode
  }

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
    if (this.#streaming) {
      this.#sendStreamChunk(JSON.stringify(data))
    } else {
      this.#body = JSON.stringify(data)
      this.header('Content-Type', 'application/json')
    }
    return this
  }

  public send(data: any): this {
    this.#body = data
    return this
  }

  public arrayBuffer(data: any): this {
    if (this.#streaming) {
      this.#sendStreamChunk(data)
    } else {
      this.#body = data
      this.header('Content-Type', 'application/octet-stream')
    }
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
    if (this.#streaming) {
      if (this.#ended || this.isAborted()) return
      this.#ended = true
      const chunks = this.#pendingChunks.splice(0)
      this.res.cork(() => {
        if (!this.#headersSent) {
          this.#headersSent = true
          this.res.writeStatus(this.#statusCode.toString())
          for (const [name, value] of this.#headers) {
            this.res.writeHeader(name, value)
          }
        }
        for (const chunk of chunks) {
          this.res.write(chunk)
        }
        this.res.end()
      })
      return
    }
    this.flush()
  }

  public setMode(mode: 'stream'): void {
    if (mode === 'stream') {
      this.#streaming = true
    }
  }

  #sendStreamChunk(data: string | ArrayBuffer | Buffer): void {
    if (this.#ended || this.isAborted()) return
    const chunk = typeof data === 'string' ? data : data.toString()
    this.#pendingChunks.push(`data: ${chunk}\n\n`)
    this.#drainChunks()
  }

  #drainChunks(): void {
    if (this.#ended || this.isAborted() || this.#pendingChunks.length === 0)
      return
    const chunks = this.#pendingChunks.splice(0)
    this.res.cork(() => {
      if (!this.#headersSent) {
        this.#headersSent = true
        this.res.writeStatus(this.#statusCode.toString())
        for (const [name, value] of this.#headers) {
          this.res.writeHeader(name, value)
        }
      }
      for (const chunk of chunks) {
        this.res.write(chunk)
      }
    })
  }

  public flush(): void {
    if (this.#streaming) return
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
