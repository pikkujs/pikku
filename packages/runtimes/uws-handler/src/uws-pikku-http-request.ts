import { parse as parseQuery } from 'picoquery'
import { parse as parseCookie } from 'cookie'
import type { HTTPMethod, PikkuHTTPRequest, PikkuQuery } from '@pikku/core/http'
import { UnprocessableContentError } from '@pikku/core/errors'

export class UWSPikkuHTTPRequest<In = unknown> implements PikkuHTTPRequest<In> {
  #cookies: Partial<Record<string, string>> | undefined
  #params: Partial<Record<string, string | string[]>> = {}

  constructor(
    private _method: HTTPMethod,
    private _path: string,
    private _query: string,
    private _headers: Record<string, string>,
    private _body?: Buffer
  ) {}

  public method(): HTTPMethod {
    return this._method
  }

  public path(): string {
    return this._path
  }

  public async json(): Promise<unknown> {
    if (!this._body || this._body.length === 0) return {}
    return JSON.parse(this._body.toString())
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    if (!this._body) return new ArrayBuffer(0)
    return new Uint8Array(this._body).buffer as ArrayBuffer
  }

  public header(name: string): string | null {
    return this._headers[name.toLowerCase()] ?? null
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
    return parseQuery(this._query) as PikkuQuery
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
    const noBodyMethods: HTTPMethod[] = ['get', 'head', 'options', 'delete']
    if (noBodyMethods.includes(this._method)) return {}
    if (!this._body || this._body.length === 0) return {}

    const contentType = this.header('content-type') || ''
    try {
      if (contentType.includes('application/json')) {
        const parsed = JSON.parse(this._body.toString())
        return typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
          ? parsed
          : { data: parsed }
      } else if (contentType.includes('text/')) {
        return { data: this._body.toString() }
      } else if (contentType.includes('application/octet-stream')) {
        return {
          data: new Uint8Array(this._body).buffer as ArrayBuffer,
        }
      } else if (contentType === 'application/x-www-form-urlencoded') {
        return Object.fromEntries(new URLSearchParams(this._body.toString()))
      } else {
        throw new UnprocessableContentError(
          `Unsupported content type ${contentType}`
        )
      }
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
