import type { PikkuHTTPRequest, HTTPMethod, PikkuQuery } from '@pikku/core/http'

export interface StubHttpRequestConfig {
  method: HTTPMethod
  path: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
  body?: unknown
  query?: Record<string, string | string[]>
}

export class StubHttpRequest implements PikkuHTTPRequest {
  private _params: Record<string, string | string[] | undefined> = {}
  private readonly _headers: Record<string, string>
  private readonly _cookies: Record<string, string>

  constructor(private readonly config: StubHttpRequestConfig) {
    this._headers = config.headers ?? {}
    this._cookies = config.cookies ?? {}
  }

  method(): HTTPMethod {
    return this.config.method
  }

  path(): string {
    return this.config.path
  }

  async data(): Promise<unknown> {
    return this.config.body ?? {}
  }

  async json(): Promise<unknown> {
    return this.config.body ?? {}
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const json = JSON.stringify(this.config.body ?? {})
    return new TextEncoder().encode(json).buffer as ArrayBuffer
  }

  headers(): Record<string, string> {
    return { ...this._headers }
  }

  header(name: string): string | null {
    return this._headers[name.toLowerCase()] ?? this._headers[name] ?? null
  }

  cookie(name?: string): string | null {
    if (!name) return null
    return this._cookies[name] ?? null
  }

  params(): Partial<Record<string, string | string[]>> {
    return this._params
  }

  setParams(params: Record<string, string | string[] | undefined>): void {
    this._params = params
  }

  query(): PikkuQuery {
    return (this.config.query ?? {}) as PikkuQuery
  }
}
