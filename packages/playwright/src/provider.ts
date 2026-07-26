import type { BrowserContext } from '@playwright/test'
import type { ScenarioActorConfig } from '@pikku/core/services'
import type { ScenarioBrowserProvider } from '@pikku/core/workflow'
import { ActorSession } from './actor-session.js'
import { connectOrLaunch, type BrowserConnection } from './browser-launch.js'
import { browserConfigFromEnv, type BrowserConfig } from './config.js'

/** What the actor sign-in endpoint is posted, for one actor. */
export interface ActorSignInRequest {
  email: string
  name: string
  secret: string
}

/** Where the actor sign-in endpoint lives, and which origin it is called from. */
export interface ActorSignInTarget {
  apiUrl: string
  appUrl: string
  signInPath: string
}

/**
 * Establish the actor's session inside its own browser context. Overridable so
 * a project on a different auth plugin can plant its own cookie.
 */
export type ActorSignIn = (
  context: BrowserContext,
  request: ActorSignInRequest,
  target: ActorSignInTarget
) => Promise<void>

export interface PlaywrightScenarioBrowserProviderOptions {
  config?: BrowserConfig
  /** The actor impersonation secret — the same SCENARIO_ACTOR_SECRET the HTTP actors use. */
  secret: string
  /** Actor name → config, from pikku.config.json's `scenarios.actors`. */
  actors: Record<string, ScenarioActorConfig>
  /** Sign-in path under apiUrl. Default: the actor plugin's `/auth/sign-in/actor`. */
  signInPath?: string
  connectBrowser?: () => Promise<BrowserConnection>
  signIn?: ActorSignIn
}

/**
 * Hands scenario steps a browser, one isolated context per actor.
 *
 * The context signs in through the SAME actor path the HTTP actors use
 * (`signInPath` + the actor secret) rather than a persona email/password, so
 * `wire.browser` and `wire.scenarioStep.actor` are the same identity — a
 * browser step and an RPC step in one scenario act as one user.
 */
export class PlaywrightScenarioBrowserProvider implements ScenarioBrowserProvider {
  private readonly config: BrowserConfig
  private sessions = new Map<string, Promise<ActorSession>>()
  private connection?: Promise<BrowserConnection>

  constructor(
    private readonly options: PlaywrightScenarioBrowserProviderOptions
  ) {
    this.config = options.config ?? browserConfigFromEnv()
  }

  async sessionFor(actorName: string): Promise<ActorSession> {
    const existing = this.sessions.get(actorName)
    if (existing) {
      return existing
    }
    const actorConfig = this.options.actors[actorName]
    if (!actorConfig) {
      throw new Error(
        `[scenario] browser actor '${actorName}' is not configured — add it to scenarios.actors in pikku.config.json`
      )
    }
    // Cache the promise, not the resolved session, so two steps racing for the
    // same actor share one window instead of opening two.
    const opening = this.openSession(actorName, actorConfig).catch((err) => {
      this.sessions.delete(actorName)
      throw err
    })
    this.sessions.set(actorName, opening)
    return opening
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    for (const session of sessions) {
      await session.then((s) => s.close()).catch(() => {})
    }
    const connection = this.connection
    this.connection = undefined
    if (connection) {
      const { release } = await connection
      await release?.()
    }
  }

  private async openSession(
    actorName: string,
    actorConfig: ScenarioActorConfig
  ): Promise<ActorSession> {
    const { browser } = await this.browser()
    const session = new ActorSession(actorName, this.config)
    await session.open(browser)
    const signIn = this.options.signIn ?? defaultActorSignIn
    await signIn(
      session.context,
      {
        email: actorConfig.email,
        name: actorConfig.name ?? actorName,
        secret: this.options.secret,
      },
      {
        apiUrl: this.config.apiUrl,
        appUrl: this.config.appUrl,
        signInPath: this.options.signInPath ?? '/auth/sign-in/actor',
      }
    )
    return session
  }

  private browser(): Promise<BrowserConnection> {
    if (!this.connection) {
      const connect = this.options.connectBrowser
        ? this.options.connectBrowser()
        : connectOrLaunch(this.config)
      this.connection = connect.catch((err) => {
        // Clear the cached rejection so the next scenario retries the connect.
        this.connection = undefined
        throw err
      })
    }
    return this.connection
  }
}

/**
 * Sign in via the Better Auth actor plugin and land its Set-Cookie headers in
 * this actor's browser context, so page navigations carry the session.
 */
const defaultActorSignIn: ActorSignIn = async (context, request, target) => {
  const res = await fetch(`${target.apiUrl}${target.signInPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(target.appUrl).origin,
    },
    body: JSON.stringify(request),
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(
      `[scenario] browser actor sign-in failed for '${request.email}' (${res.status}): ${body}`
    )
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  if (setCookies.length === 0) {
    throw new Error(
      `[scenario] browser actor sign-in for '${request.email}' returned no session cookie`
    )
  }
  await context.addCookies(
    setCookies.map((raw) => parseCookie(raw, target.appUrl))
  )
}

function parseCookie(
  raw: string,
  appUrl: string
): Parameters<BrowserContext['addCookies']>[0][number] {
  const [pair = '', ...attrs] = raw.split(';')
  const eq = pair.indexOf('=')
  const cookie: Parameters<BrowserContext['addCookies']>[0][number] = {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim(),
    url: appUrl,
  }
  for (const attr of attrs) {
    const [k = '', v = ''] = attr.split('=').map((s) => s.trim())
    const key = k.toLowerCase()
    if (key === 'max-age') {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(v)
    } else if (key === 'expires' && cookie.expires === undefined) {
      cookie.expires = Math.floor(new Date(v).getTime() / 1000)
    } else if (key === 'httponly') {
      cookie.httpOnly = true
    } else if (key === 'secure') {
      cookie.secure = true
    } else if (key === 'samesite') {
      cookie.sameSite = (v.charAt(0).toUpperCase() +
        v.slice(1).toLowerCase()) as 'Strict' | 'Lax' | 'None'
    }
  }
  return cookie
}
