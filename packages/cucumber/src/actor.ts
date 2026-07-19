import { CorePikkuFetch } from '@pikku/fetch'

export interface ActorDispatchContext {
  lastResult: unknown
  lastError: Error | undefined
  call(
    personaName: string,
    rpcName: string,
    data: unknown,
    headers?: Record<string, string>
  ): Promise<void>
}

type ActorCallResult =
  | { result: unknown; error: undefined }
  | { result: undefined; error: Error }

function isServerMode(ctx: ActorDispatchContext): boolean {
  const pickle = (
    ctx as unknown as { pickle?: { tags?: Array<{ name: string }> } }
  ).pickle
  return pickle?.tags?.some((t) => t.name === '@server') ?? false
}

export class Actor {
  private _headers: Record<string, string> = {}
  private _cookies: Record<string, string> = {}
  readonly baseUrl: string

  constructor(
    readonly name: string,
    readonly credentials: Record<string, unknown>,
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl ?? process.env.BASE_URL ?? 'http://localhost:4004'
  }

  get headers(): Record<string, string> {
    return { ...this._headers }
  }

  setToken(token: string) {
    this._headers['authorization'] = `Bearer ${token}`
  }

  setHeader(key: string, value: string) {
    this._headers[key.toLowerCase()] = value
  }

  /** The `Cookie` header value for this actor's jar (empty string if none). */
  get cookieHeader(): string {
    return Object.entries(this._cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  /** Drop every cookie from this actor's jar (e.g. to start a fresh session). */
  clearCookies() {
    this._cookies = {}
  }

  /** Capture `Set-Cookie` headers from a response into this actor's jar. */
  storeSetCookie(res: Response) {
    const cookies =
      (res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
    for (const cookie of cookies) {
      const [pair] = cookie.split(';')
      if (!pair) continue
      const idx = pair.indexOf('=')
      if (idx === -1) continue
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      // Max-Age=0 clears emit an empty value — drop the cookie.
      if (value === '') delete this._cookies[name]
      else this._cookies[name] = value
    }
  }

  /**
   * A `fetch` implementation bound to this actor's cookie jar — replays stored
   * cookies, stamps an `Origin` header (cookie-auth servers like Better Auth
   * reject state-changing requests without one), and captures `Set-Cookie` from
   * the response. Pass it to a client SDK's `customFetchImpl` so the actor
   * drives a real cookie-backed session.
   */
  readonly cookieFetch: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined)
    const cookie = this.cookieHeader
    if (cookie) headers.set('cookie', cookie)
    if (!headers.has('origin')) headers.set('origin', this.baseUrl)
    const res = await fetch(input as RequestInfo, { ...init, headers })
    this.storeSetCookie(res)
    return res
  }

  private async httpCall(
    rpcName: string,
    data: unknown
  ): Promise<ActorCallResult> {
    const client = new CorePikkuFetch({ serverUrl: this.baseUrl })
    const authHeader = this._headers['authorization']
    if (authHeader?.startsWith('Bearer ')) {
      client.setAuthorizationJWT(authHeader.slice(7))
    }
    const extraHeaders = Object.fromEntries(
      Object.entries(this._headers).filter(([k]) => k !== 'authorization')
    )
    const options = Object.keys(extraHeaders).length
      ? { headers: extraHeaders }
      : undefined

    try {
      const result = await client.api(
        `/rpc/${rpcName}`,
        'POST',
        { data },
        options
      )
      return { result, error: undefined }
    } catch (thrown: unknown) {
      // client.api throws a PikkuFetchError — an Error already carrying the
      // server's decoded message and name — on any non-2xx.
      if (thrown instanceof Error) {
        return { result: undefined, error: thrown }
      }
      return { result: undefined, error: new Error(String(thrown)) }
    }
  }

  async call(
    ctx: ActorDispatchContext,
    rpc: string,
    data: unknown
  ): Promise<void> {
    if (isServerMode(ctx)) {
      const { result, error } = await this.httpCall(rpc, data)
      ctx.lastResult = result
      ctx.lastError = error
    } else {
      await ctx.call(this.name, rpc, data, this.headers)
    }
  }

  async login(ctx: ActorDispatchContext, loginRpc: string): Promise<void> {
    await this.call(ctx, loginRpc, this.credentials)
    if (ctx.lastError) throw ctx.lastError
    const token = (ctx.lastResult as Record<string, unknown> | null)?.token
    if (typeof token === 'string') this.setToken(token)
  }
}
