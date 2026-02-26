import { parse as parseCookie } from 'cookie'
import type { FastifyRequest } from 'fastify'
import type { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from '@pikku/core/http'
import { UnprocessableContentError } from '@pikku/core/errors'

export class FastifyPikkuHTTPRequest<In = unknown>
  implements PikkuHTTPRequest<In>
{
  #cookies: Partial<Record<string, string>> | undefined
  #params: Partial<Record<string, string | string[]>> = {}

  constructor(private req: FastifyRequest) {}

  public method(): HTTPMethod {
    return this.req.method.toLowerCase() as HTTPMethod
  }

  public path(): string {
    const url = this.req.url
    const qIdx = url.indexOf('?')
    return qIdx === -1 ? url : url.slice(0, qIdx)
  }

  public async json(): Promise<unknown> {
    return this.req.body ?? {}
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    const body = this.req.body
    if (Buffer.isBuffer(body)) {
      return new Uint8Array(body).buffer as ArrayBuffer
    }
    return new ArrayBuffer(0)
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
    return (this.req.query ?? {}) as PikkuQuery
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
