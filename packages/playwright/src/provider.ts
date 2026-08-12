import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from '@playwright/test'
import type { ResolvedPersona } from '@pikku/core/services'
import type {
  ScenarioBrowserFailure,
  ScenarioBrowserProvider,
} from '@pikku/core/workflow'
import { ActorSession } from './actor-session.js'
import { compressVideosIn, type CaptureOptions } from './capture.js'
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
  /** Actor name → the persona filling it, resolved from `definePersonas()`. */
  actors: Record<string, ResolvedPersona>
  /** Sign-in path under apiUrl. Default: the actor plugin's `/auth/sign-in/actor`. */
  signInPath?: string
  /** Where `captureFailure` writes screenshots. Without it, none are taken. */
  failureDir?: string
  /**
   * Artifacts for this run — screenshots taken by name, and optionally a video
   * per scenario. Absent means a step's `screenshot()` still returns bytes and
   * writes nothing, so scenarios do not have to know whether the flag is on.
   */
  capture?: CaptureOptions
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
  /** The scenario currently running, stamped onto every capture it takes. */
  private scenario?: string

  constructor(
    private readonly options: PlaywrightScenarioBrowserProviderOptions
  ) {
    this.config = options.config ?? browserConfigFromEnv()
  }

  /**
   * Name the scenario about to run.
   *
   * Called by the runner as each scenario starts so captures are filed under
   * it. A provider that is never told simply files under 'scenario', which is
   * worse to read and never wrong.
   */
  beginScenario(scenario: string): void {
    this.scenario = scenario
    for (const pending of this.sessions.values()) {
      pending
        .then((s) => {
          if (s.capture) s.capture.scenario = scenario
        })
        .catch(() => {})
    }
  }

  async sessionFor(actorName: string): Promise<ActorSession> {
    const existing = this.sessions.get(actorName)
    if (existing) {
      return existing
    }
    const actorConfig = this.options.actors[actorName]
    if (!actorConfig) {
      throw new Error(
        `[scenario] browser actor '${actorName}' has no persona — add it to a definePersonas({ ... }) call`
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

  /**
   * Close every actor's context, keeping the browser. The next `sessionFor`
   * opens a fresh context and re-runs the actor sign-in, so a scenario starts
   * with no cookies, no storage and no pages from the one before it.
   */
  async reset(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    for (const session of sessions) {
      await session.then((s) => s.close()).catch(() => {})
    }
  }

  async captureFailure(label: string): Promise<ScenarioBrowserFailure[]> {
    const failures: ScenarioBrowserFailure[] = []
    for (const [actorName, pending] of this.sessions) {
      const session = await pending.catch(() => undefined)
      if (!session) {
        continue
      }
      const failure: ScenarioBrowserFailure = {
        actor: actorName,
        ...session.takeIssues(),
      }
      // Every read below can throw on a window the browser already tore down,
      // and this runs while a scenario is ALREADY failing — losing the real
      // error to a capture error would be the worst possible trade.
      try {
        failure.url = session.page.url()
      } catch {}
      if (this.options.failureDir) {
        try {
          const file = join(
            this.options.failureDir,
            `${slugify(label)}-${slugify(actorName)}.png`
          )
          await mkdir(this.options.failureDir, { recursive: true })
          await session.screenshot(file)
          failure.screenshot = file
        } catch {}
      }
      failures.push(failure)
    }
    return failures
  }

  async close(): Promise<void> {
    await this.reset()
    // Only after reset(): Playwright finalises a video when its context closes,
    // so compressing before this point would re-encode files still being written.
    const capture = this.options.capture
    if (capture?.video && capture.compress !== false) {
      await compressVideosIn(join(capture.dir, capture.runId, 'video')).catch(
        () => 0
      )
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
    actorConfig: ResolvedPersona
  ): Promise<ActorSession> {
    const { browser } = await this.browser()
    const session = new ActorSession(actorName, this.config)
    const capture = this.options.capture
    await session.open(
      browser,
      capture?.video ? join(capture.dir, capture.runId, 'video') : undefined
    )
    if (capture) {
      session.capture = {
        dir: capture.dir,
        runId: capture.runId,
        scenario: this.scenario,
      }
    }
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

/** A scenario label ("code editor › edits") as a usable filename. */
const slugify = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'scenario'

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
