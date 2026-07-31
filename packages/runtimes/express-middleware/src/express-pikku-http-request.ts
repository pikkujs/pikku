import { parse as parseCookie } from 'cookie'
import type { Request as ExpressRequest } from 'express'
import type { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from '@pikku/core/http'
import { DEFAULT_MAX_BODY_SIZE } from '@pikku/core/http'
import {
  PayloadTooLargeError,
  UnprocessableContentError,
} from '@pikku/core/errors'

export type ExpressPikkuHTTPRequestOptions = Partial<{
  /** Maximum request body size in bytes. Defaults to `DEFAULT_MAX_BODY_SIZE`. */
  maxBodySize: number
}>

export class ExpressPikkuHTTPRequest<
  In = unknown,
> implements PikkuHTTPRequest<In> {
  #cookies: Partial<Record<string, string>> | undefined
  #params: Partial<Record<string, string | string[]>> = {}
  #maxBodySize: number

  constructor(
    private req: ExpressRequest,
    { maxBodySize = DEFAULT_MAX_BODY_SIZE }: ExpressPikkuHTTPRequestOptions = {}
  ) {
    this.#maxBodySize = maxBodySize
  }

  /**
   * Express hands Pikku a body its own parser already buffered, so the declared
   * content-length is the only measure of what came off the wire for a parsed
   * object. Prevention lives in the parser limit (`express.json({ limit })`);
   * this is the backstop that keeps the rejection identical across runtimes.
   */
  #assertBodyWithinLimit(): void {
    const declared = Number(this.header('content-length'))
    if (Number.isFinite(declared) && declared > this.#maxBodySize) {
      throw this.#payloadTooLarge()
    }
    const body = this.req.body
    const size = Buffer.isBuffer(body)
      ? body.byteLength
      : typeof body === 'string'
        ? Buffer.byteLength(body)
        : 0
    if (size > this.#maxBodySize) {
      throw this.#payloadTooLarge()
    }
  }

  #payloadTooLarge(): PayloadTooLargeError {
    return new PayloadTooLargeError(
      `Request body exceeds the maximum size of ${this.#maxBodySize} bytes`
    )
  }

  public method(): HTTPMethod {
    return this.req.method.toLowerCase() as HTTPMethod
  }

  public path(): string {
    return this.req.path
  }

  public async json(): Promise<unknown> {
    this.#assertBodyWithinLimit()
    return this.req.body ?? {}
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    this.#assertBodyWithinLimit()
    if (Buffer.isBuffer(this.req.body)) {
      return new Uint8Array(this.req.body).buffer as ArrayBuffer
    }
    return new ArrayBuffer(0)
  }

  public headers(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(this.req.headers)) {
      if (value != null) {
        result[key] = Array.isArray(value) ? value.join(', ') : value
      }
    }
    return result
  }

  public header(name: string): string | null {
    const val = this.req.headers[name.toLowerCase()]
    if (!val) return null
    return Array.isArray(val) ? val.join(', ') : val
  }

  public cookie(name: string): string | null {
    if (!this.#cookies) {
      const cookieHeader = this.header('cookie')
      this.#cookies = cookieHeader ? parseCookie(cookieHeader) : {}
    }
    return this.#cookies[name] ?? null
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
    return this.req.query as PikkuQuery
  }

  public async data(): Promise<In> {
    const body = this.parseBody()
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

  private parseBody(): any {
    const method = this.req.method.toLowerCase() as HTTPMethod
    const noBodyMethods: HTTPMethod[] = ['get', 'head', 'options', 'delete']
    if (noBodyMethods.includes(method)) return {}

    this.#assertBodyWithinLimit()

    const body = this.req.body
    if (body == null) return {}

    if (typeof body === 'object' && !Buffer.isBuffer(body)) {
      return Array.isArray(body) ? { data: body } : body
    }

    const contentType = this.header('content-type') || ''
    try {
      if (Buffer.isBuffer(body)) {
        if (body.length === 0) return {}
        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(body.toString())
          return typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? parsed
            : { data: parsed }
        } else if (contentType.includes('text/')) {
          return { data: body.toString() }
        } else if (contentType.includes('application/octet-stream')) {
          return {
            data: new Uint8Array(body).buffer as ArrayBuffer,
          }
        } else if (contentType === 'application/x-www-form-urlencoded') {
          return Object.fromEntries(new URLSearchParams(body.toString()))
        } else {
          throw new UnprocessableContentError(
            `Unsupported content type ${contentType}`
          )
        }
      }

      if (typeof body === 'string') {
        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(body)
          return typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? parsed
            : { data: parsed }
        }
        return { data: body }
      }

      return {}
    } catch (e) {
      if (e instanceof UnprocessableContentError) throw e
      throw new UnprocessableContentError(`Error parsing body: ${e}`)
    }
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
