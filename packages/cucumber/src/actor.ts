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

  private async httpCall(
    rpcName: string,
    data: unknown
  ): Promise<ActorCallResult> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/rpc/${rpcName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this._headers },
        body: JSON.stringify({ data }),
      })
    } catch (err) {
      return { result: undefined, error: err as Error }
    }
    try {
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
        const err = new Error((body.message as string | undefined) ?? response.statusText)
        err.name = (body.name as string | undefined) ?? 'HttpError'
        return { result: undefined, error: err }
      }
      const result = await response.json()
      return { result, error: undefined }
    } catch (thrown: unknown) {
      return { result: undefined, error: thrown as Error }
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
