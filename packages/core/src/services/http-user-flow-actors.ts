import type {
  UserFlowActor,
  UserFlowActorConfig,
  UserFlowActors,
} from './user-flow-actors-service.js'

export interface HttpUserFlowActorsConfig {
  /**
   * Base API URL of the target app, INCLUDING the HTTP prefix — e.g.
   * `https://app.example.com/api` or `http://localhost:4000/api`. Actor
   * sign-in is reached at `${apiUrl}${signInPath}` and exposed RPCs at
   * `${apiUrl}${rpcPath}/:rpcName`.
   */
  apiUrl: string
  /**
   * The actor impersonation secret. Sign-in only ever works for user rows
   * flagged `actor: true` — knowing the secret never impersonates real users.
   */
  secret: string
  /** Actor name → config (usually from pikku.config.json's actor registry). */
  actors: Record<string, UserFlowActorConfig>
  /** Sign-in path under apiUrl. Default: the actor plugin's `/auth/sign-in/actor`. */
  signInPath?: string
  /** Exposed-RPC path prefix under apiUrl. Default `/rpc`. */
  rpcPath?: string
}

/**
 * Default HTTP-backed actor. Signs in lazily on first invoke via the Better
 * Auth actor plugin (`POST /auth/sign-in/actor` with `{ email, secret }` —
 * the plugin upserts the actor-flagged user row and mints a session whose
 * `actor` flag flows into audits/analytics). Holds the session cookies for
 * its lifetime; a 401 mid-run re-logs-in once (long health-check runs can
 * outlive a session).
 */
export class HttpUserFlowActor implements UserFlowActor {
  private cookie: string | null = null
  private origin: string

  constructor(
    readonly name: string,
    private actorConfig: UserFlowActorConfig,
    private config: HttpUserFlowActorsConfig
  ) {
    this.origin = new URL(config.apiUrl).origin
  }

  get email(): string {
    return this.actorConfig.email
  }

  async invoke(rpcName: string, data: unknown): Promise<unknown> {
    const cookie = this.cookie ?? (await this.login())
    const res = await this.postRpc(rpcName, data, cookie)
    if (res.status === 401) {
      // Session expired mid-run — re-login once and retry.
      this.cookie = null
      return this.readRpcResponse(rpcName, await this.postRpc(rpcName, data, await this.login()))
    }
    return this.readRpcResponse(rpcName, res)
  }

  private async postRpc(rpcName: string, data: unknown, cookie: string) {
    const rpcPath = this.config.rpcPath ?? '/rpc'
    return fetch(`${this.config.apiUrl}${rpcPath}/${rpcName}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: this.origin,
        cookie,
      },
      body: JSON.stringify({ data }),
    })
  }

  private async readRpcResponse(rpcName: string, res: Response) {
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(
        `[user-flow] '${rpcName}' as '${this.name}' returned ${res.status}: ${body}`
      )
    }
    if (res.status === 204) return undefined
    const text = await res.text()
    return text ? JSON.parse(text) : undefined
  }

  private async login(): Promise<string> {
    const signInPath = this.config.signInPath ?? '/auth/sign-in/actor'
    const res = await fetch(`${this.config.apiUrl}${signInPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: this.origin },
      body: JSON.stringify({
        email: this.actorConfig.email,
        name: this.actorConfig.name ?? this.name,
        secret: this.config.secret,
      }),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(
        `[user-flow] actor sign-in failed for '${this.name}' (${res.status}): ${body}`
      )
    }
    const setCookies = res.headers.getSetCookie?.() ?? []
    const cookie = setCookies
      .map((c) => c.split(';')[0]!)
      .filter(Boolean)
      .join('; ')
    if (!cookie) {
      throw new Error(
        `[user-flow] actor sign-in for '${this.name}' returned no session cookie`
      )
    }
    this.cookie = cookie
    return cookie
  }
}

/**
 * Build the injected `actors` service from the config registry: actor name →
 * lazy HTTP actor. Wire the result as the `actors` singleton service.
 */
export function createHttpUserFlowActors(
  config: HttpUserFlowActorsConfig
): UserFlowActors {
  const actors: UserFlowActors = {}
  for (const [name, actorConfig] of Object.entries(config.actors)) {
    actors[name] = new HttpUserFlowActor(name, actorConfig, config)
  }
  return actors
}
