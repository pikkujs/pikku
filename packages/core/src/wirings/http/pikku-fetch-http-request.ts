import { parse as parseQuery } from 'picoquery'
import { parseCookie } from 'cookie'
import type { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from './http.types.js'
import {
  PayloadTooLargeError,
  UnprocessableContentError,
} from '../../errors/errors.js'

export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024

export type PikkuFetchHTTPRequestOptions = Partial<{
  /** Maximum request body size in bytes. Defaults to {@link DEFAULT_MAX_BODY_SIZE}. */
  maxBodySize: number
}>

/**
 * @group RequestResponse
 */
export class PikkuFetchHTTPRequest<
  In = unknown,
> implements PikkuHTTPRequest<In> {
  #cookies: Partial<Record<string, string>> | undefined
  #params: Partial<Record<string, string | string[]>> = {}
  #url: URL
  #rawBodyText: string | undefined
  #rawBodyBuffer: ArrayBuffer | undefined
  #rawBufferPromise: Promise<ArrayBuffer> | undefined
  #maxBodySize: number

  constructor(
    private request: Request,
    { maxBodySize = DEFAULT_MAX_BODY_SIZE }: PikkuFetchHTTPRequestOptions = {}
  ) {
    this.#url = new URL(request.url)
    this.#maxBodySize = maxBodySize
  }

  public method(): HTTPMethod {
    return this.request.method.toLowerCase() as HTTPMethod
  }

  public path(): string {
    return this.#url.pathname
  }

  public async json(): Promise<In> {
    const text = await this.#readRawText()
    return JSON.parse(text) as In
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    return this.#readRawBuffer()
  }

  async #readRawBuffer(): Promise<ArrayBuffer> {
    if (this.#rawBodyBuffer !== undefined) {
      return this.#rawBodyBuffer
    }
    if (this.#rawBodyText !== undefined) {
      const buf = new TextEncoder().encode(this.#rawBodyText)
        .buffer as ArrayBuffer
      this.#rawBodyBuffer = buf
      return buf
    }
    if (this.#rawBufferPromise !== undefined) {
      console.warn(
        `[pikku] request body for ${this.method().toUpperCase()} ${this.path()} ` +
          `was requested again before the first read resolved — the read is now ` +
          `shared, but a duplicate body consumer (e.g. middleware calling ` +
          `toWebRequest just for headers) should be removed.`
      )
      return this.#rawBufferPromise
    }
    this.#rawBufferPromise = this.#readBoundedBuffer().then((buf) => {
      this.#rawBodyBuffer = buf
      return buf
    })
    return this.#rawBufferPromise
  }

  async #readBoundedBuffer(): Promise<ArrayBuffer> {
    const contentLength = this.request.headers.get('content-length')
    if (contentLength !== null) {
      const declaredSize = Number(contentLength)
      if (Number.isFinite(declaredSize) && declaredSize > this.#maxBodySize) {
        throw this.#payloadTooLarge()
      }
    }

    const stream = this.request.body
    if (stream === null) {
      const buffer = await this.request.arrayBuffer()
      if (buffer.byteLength > this.#maxBodySize) {
        throw this.#payloadTooLarge()
      }
      return buffer
    }

    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        size += value.byteLength
        if (size > this.#maxBodySize) {
          await reader.cancel()
          throw this.#payloadTooLarge()
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }

    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body.buffer as ArrayBuffer
  }

  #payloadTooLarge(): PayloadTooLargeError {
    return new PayloadTooLargeError(
      `Request body exceeds the maximum size of ${this.#maxBodySize} bytes`
    )
  }

  async #readRawText(): Promise<string> {
    if (this.#rawBodyText !== undefined) {
      return this.#rawBodyText
    }
    const text = new TextDecoder().decode(await this.#readRawBuffer())
    this.#rawBodyText = text
    return text
  }

  public headers(): Record<string, string> {
    return Object.fromEntries(this.request.headers.entries())
  }

  public header(headerName: string): string | null {
    return this.request.headers.get(headerName.toLowerCase())
  }

  public cookie(cookieName: string): string | null {
    if (this.#cookies?.[cookieName]) {
      return this.#cookies[cookieName]
    }
    const cookieHeader = this.header('cookie')
    this.#cookies = cookieHeader ? parseCookie(cookieHeader) : {}
    return this.#cookies[cookieName] || null
  }

  public params(): Partial<Record<string, string | string[]>> {
    return this.#params
  }

  public setParams(
    params: Record<string, string | string[] | undefined>
  ): void {
    this.#params = params
  }

  public query(): PikkuQuery {
    return parseQuery(this.#url.searchParams.toString()) as PikkuQuery
  }

  public async data(): Promise<In> {
    const body = await this.body()
    const parts = [this.params(), this.query(), body]
    const merged: Record<string, unknown> = {}
    for (const part of parts) {
      for (const [key, value] of Object.entries(part)) {
        if (
          key === '__proto__' ||
          key === 'constructor' ||
          key === 'prototype'
        ) {
          continue
        }
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
        const text = await this.#readRawText()
        const parsed = text ? JSON.parse(text) : null
        body =
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
            ? parsed
            : { data: parsed }
      } else if (contentType.includes('text/')) {
        const text = await this.#readRawText()
        body = { data: text }
      } else if (contentType.includes('application/octet-stream')) {
        const buffer = await this.arrayBuffer()
        body = { data: buffer }
      } else if (contentType === 'application/x-www-form-urlencoded') {
        const text = await this.#readRawText()
        const params = new URLSearchParams(text)
        let count = 0
        for (const _ of params) {
          if (++count > 256) {
            throw new UnprocessableContentError('Too many form parameters')
          }
        }
        body = Object.fromEntries(params)
      } else {
        throw new UnprocessableContentError(
          `Unsupported content type ${contentType}`
        )
      }
    } catch (e) {
      if (e instanceof PayloadTooLargeError) {
        throw e
      }
      throw new UnprocessableContentError(`Error parsing body: ${e}`)
    }
    return body
  }
}

function valuesAreEquivalent(a: unknown, b: unknown): boolean {
  return coerce(a) === coerce(b)
}

function coerce(value: unknown): unknown {
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
    const num = Number(value)
    return isNaN(num) ? value : num
  }
  return value
}
