export type ActorCallResult =
  | { result: unknown; error: undefined }
  | { result: undefined; error: Error }

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

  async call(rpcName: string, data: unknown): Promise<ActorCallResult> {
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

    if (response.ok) {
      const body = await response.json().catch(() => null)
      return { result: body, error: undefined }
    }

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    const err = new Error(
      (body.message as string | undefined) ?? response.statusText
    )
    err.name = (body.name as string | undefined) ?? 'HttpError'
    return { result: undefined, error: err }
  }

  async login(loginRpc: string): Promise<void> {
    const { result, error } = await this.call(loginRpc, this.credentials)
    if (error) throw error
    const token = (result as Record<string, unknown> | null)?.token
    if (typeof token === 'string') this.setToken(token)
  }
}
