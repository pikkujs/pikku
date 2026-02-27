import type { FastifyReply } from 'fastify'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import { serialize as serializeCookie, type SerializeOptions } from 'cookie'

export class FastifyPikkuHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers: [string, string][] = []
  #body: string | Buffer | ArrayBuffer | undefined
  #ended = false
  #streaming = false

  constructor(private reply: FastifyReply) {}

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
    if (this.#streaming) {
      this.reply.raw.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
      return this
    }
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
      this.reply.raw.end()
    }
  }

  public setMode(_mode: 'stream'): void {
    this.#streaming = true
  }

  public get isStreaming(): boolean {
    return this.#streaming
  }

  public flush(): void {
    if (this.#ended) return
    if (this.#streaming) {
      this.reply.raw.writeHead(this.#statusCode, this.#headers.reduce((acc, [name, value]) => {
        const existing = acc[name]
        if (existing) {
          acc[name] = Array.isArray(existing) ? [...existing, value] : [existing, value]
        } else {
          acc[name] = value
        }
        return acc
      }, {} as Record<string, string | string[]>))
      return
    }
    this.#ended = true
    this.reply.status(this.#statusCode)
    for (const [name, value] of this.#headers) {
      this.reply.header(name, value)
    }
    if (this.#body != null) {
      this.reply.send(this.#body)
    } else {
      this.reply.send()
    }
  }
}
