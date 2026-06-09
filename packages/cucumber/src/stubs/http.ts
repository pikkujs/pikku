export class StubHttpResponse {
  statusCode = 200
  private readonly _headers: Record<string, string> = {}

  status(code: number): this {
    this.statusCode = code
    return this
  }

  header(name: string, value: string | string[]): this {
    this._headers[name.toLowerCase()] = Array.isArray(value)
      ? value.join(', ')
      : value
    return this
  }

  cookie(): this {
    return this
  }

  clearCookie(): this {
    return this
  }

  arrayBuffer(): this {
    return this
  }

  json(): this {
    return this
  }

  redirect(): this {
    return this
  }

  get headers(): Record<string, string> {
    return { ...this._headers }
  }
}

export interface StubHttp {
  response: StubHttpResponse
  wire: {
    request: {
      header(name: string): string | null
      headers(): Record<string, string>
      cookie(name: string): string | null
      params(): Record<string, string>
      query(): Record<string, string>
    }
    response: StubHttpResponse
  }
  setRequestHeader(name: string, value: string): void
  setRequestCookie(name: string, value: string): void
}

export function createStubHttp(): StubHttp {
  const response = new StubHttpResponse()
  const requestHeaders: Record<string, string> = {}
  const requestCookies = new Map<string, string>()

  return {
    response,
    wire: {
      request: {
        header: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
        headers: () => ({ ...requestHeaders }),
        cookie: (name: string) => requestCookies.get(name) ?? null,
        params: () => ({}),
        query: () => ({}),
      },
      response,
    },
    setRequestHeader(name: string, value: string) {
      requestHeaders[name.toLowerCase()] = value
    },
    setRequestCookie(name: string, value: string) {
      requestCookies.set(name, value)
    },
  }
}
