import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Video } from '@playwright/test'
import type { ResolvedPersona } from '@pikku/core/services'
import type {
  ScenarioArtifact,
  ScenarioBrowserFailure,
  ScenarioBrowserProvider,
} from '@pikku/core/scenario'
import { ActorSession, type CaptureContext } from './actor-session.js'
import { compressVideos, slug, type CaptureOptions } from './capture.js'
import { connectOrLaunch, type BrowserConnection } from './browser-launch.js'
import { browserConfigFromEnv, type BrowserConfig } from './config.js'

/**
 * Where Playwright drops its own recordings before retention files them.
 *
 * Its filenames are generated and carry no actor or scenario, so nothing is
 * meant to read this directory — it is emptied as the run ends.
 */
const VIDEO_STAGING_DIR = '.video-raw'

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
  /**
   * Artifacts for this run — screenshots taken by name, and a video per
   * scenario kept according to `video`. Absent, or with `screenshots` off, a
   * step's `screenshot()` still returns bytes and writes nothing, so scenarios
   * do not have to know whether the flag is on.
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
  /**
   * The capture state for the scenario currently running, handed to every
   * session by reference so the scenario name and the capture count are shared
   * rather than copied per actor.
   */
  private captureContext?: CaptureContext
  /**
   * How the scenario currently running ended.
   *
   * Held rather than acted on immediately because a video only exists once its
   * context closes, and contexts are closed by the NEXT scenario's reset — so
   * the outcome has to outlive the scenario that produced it.
   */
  private outcome?: 'passed' | 'failed'

  constructor(
    private readonly options: PlaywrightScenarioBrowserProviderOptions
  ) {
    this.config = options.config ?? browserConfigFromEnv()
    if (options.capture) {
      // Built once and handed to every session by reference, so the scenario
      // name, the capture count and the ledger are shared rather than copied
      // per actor — a two-actor scenario numbers its images in the order they
      // were taken, not once per window.
      this.captureContext = {
        dir: options.capture.dir,
        runId: options.capture.runId,
        screenshots: options.capture.screenshots === true,
        taken: 0,
        filed: [],
      }
    }
  }

  /**
   * Name the scenario about to run.
   *
   * Called by the runner as each scenario starts so captures are filed under
   * it. A provider that is never told simply files under 'scenario', which is
   * worse to read and never wrong.
   */
  beginScenario(scenario: string): void {
    if (!this.captureContext) {
      return
    }
    // Mutated in place rather than replaced, so sessions opened by the previous
    // scenario — which hold this object by reference — follow the new name and
    // count instead of going on writing under the old one.
    this.captureContext.scenario = scenario
    this.captureContext.taken = 0
    this.outcome = undefined
  }

  /**
   * How the scenario that just ran finished, which is what decides whether its
   * recording is worth keeping. A scenario the runner never reports on is
   * treated as failed: an unexplained run is exactly the one to keep footage of.
   */
  endScenario(outcome: 'passed' | 'failed'): void {
    this.outcome = outcome
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
    const scenario = this.captureContext?.scenario
    const keep = this.keepsVideo()
    for (const session of sessions) {
      const resolved = await session.catch(() => undefined)
      if (!resolved) {
        continue
      }
      // Read before closing: the handle hangs off the page, which the close is
      // about to take away — even though the file it names only exists after.
      const video = resolved.video()
      await resolved.close().catch(() => {})
      await this.retainVideo(video, resolved.actor, scenario, keep)
    }
  }

  /**
   * File this window's recording under the scenario that produced it, or throw
   * it away.
   *
   * Filing happens here rather than at record time because Playwright names
   * the file itself and only finalises it on close, so a recording is
   * attributable to an actor and a scenario for exactly this one moment.
   */
  private async retainVideo(
    video: Video | undefined,
    actor: string,
    scenario: string | undefined,
    keep: boolean
  ): Promise<void> {
    const capture = this.options.capture
    if (!video || !capture) {
      return
    }
    try {
      if (keep) {
        // The same slug the screenshots use, so a scenario's video and its
        // images land in one folder rather than two near-identical ones.
        const label = scenario ?? 'scenario'
        const path = `${slug(label)}/${slug(actor)}.webm`
        await mkdir(join(capture.dir, capture.runId, slug(label)), {
          recursive: true,
        })
        await video.saveAs(join(capture.dir, capture.runId, path))
        this.captureContext?.filed.push({
          scenario: label,
          kind: 'video',
          path,
          actor,
        })
      }
      // Either way the staged recording goes: it has been copied where it
      // belongs, or it is footage of a scenario that passed.
      await video.delete()
    } catch {}
  }

  /** Is the scenario that just ran one whose footage is worth keeping? */
  private keepsVideo(): boolean {
    const retention = this.options.capture?.video ?? 'off'
    if (retention === 'all') {
      return true
    }
    // A scenario the runner never reported on counts as failed — an
    // unexplained run is exactly the one somebody will want to watch.
    return retention === 'failed' && this.outcome !== 'passed'
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
      const capture = this.options.capture
      if (capture) {
        try {
          // The failing scenario's own folder, beside its screenshots and its
          // video: one run is one directory, and one scenario within it is
          // everything that scenario produced.
          const path = `${slug(label)}/failure-${slug(actorName)}.png`
          const file = join(capture.dir, capture.runId, path)
          await mkdir(join(capture.dir, capture.runId, slug(label)), {
            recursive: true,
          })
          await session.writeScreenshot(file)
          failure.screenshot = file
          this.captureContext?.filed.push({
            scenario: label,
            kind: 'failure',
            path,
            actor: actorName,
          })
        } catch {}
      }
      failures.push(failure)
    }
    return failures
  }

  /**
   * Everything this run filed. Complete only once `close()` has compressed the
   * recordings, because compressing changes their names.
   */
  artifacts(): ScenarioArtifact[] {
    return this.captureContext?.filed ?? []
  }

  async close(): Promise<void> {
    await this.reset()
    // Only after reset(): Playwright finalises a video when its context closes,
    // so compressing before this point would re-encode files still being written.
    // Encoding runs over what survived retention, which is why a green run pays
    // for no encoding at all.
    const capture = this.options.capture
    if (capture) {
      const runDir = join(capture.dir, capture.runId)
      if (capture.video !== 'off' && capture.compress !== false) {
        await this.compressKeptVideos(runDir)
      }
      await rm(join(runDir, VIDEO_STAGING_DIR), {
        recursive: true,
        force: true,
      }).catch(() => {})
    }
    const connection = this.connection
    this.connection = undefined
    if (connection) {
      const { release } = await connection
      await release?.()
    }
  }

  /**
   * Re-encode the recordings that survived retention, and follow them to their
   * new names in the ledger — the container changes with the codec, so a path
   * left un-rewritten points at a file that no longer exists.
   */
  private async compressKeptVideos(runDir: string): Promise<void> {
    const videos = this.artifacts().filter(
      (artifact) => artifact.kind === 'video'
    )
    const absolute = (artifact: ScenarioArtifact) =>
      join(runDir, ...artifact.path.split('/'))
    const renamed = await compressVideos(videos.map(absolute)).catch(
      () => new Map<string, string>()
    )
    for (const artifact of videos) {
      const to = renamed.get(absolute(artifact))
      if (to) {
        artifact.path = artifact.path.replace(/\.webm$/, '.mp4')
      }
    }
  }

  private async openSession(
    actorName: string,
    actorConfig: ResolvedPersona
  ): Promise<ActorSession> {
    const { browser } = await this.browser()
    const config = this.configFor(actorConfig)
    const session = new ActorSession(actorName, config)
    const capture = this.options.capture
    await session.open(
      browser,
      capture && capture.video !== 'off'
        ? join(capture.dir, capture.runId, VIDEO_STAGING_DIR)
        : undefined
    )
    if (this.captureContext) {
      session.capture = this.captureContext
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
        apiUrl: config.apiUrl,
        appUrl: config.appUrl,
        signInPath: this.options.signInPath ?? '/auth/sign-in/actor',
      }
    )
    return session
  }

  /**
   * The config this actor browses with — their own app's base url.
   *
   * A person signs into one app, so the persona's `app` is the whole answer: it
   * decides what `/dashboard` means for them, and which origin their session
   * cookie is planted on. Everything downstream (`url()`, `gotoApp`, the
   * sign-in Origin header, `parseCookie`) reads it off the session's config, so
   * choosing it here is the only place that has to know.
   *
   * An unnamed app, or one no url was given for, falls back to the single
   * `appUrl` — which is the whole story for the common one-app project.
   */
  private configFor(persona: ResolvedPersona): BrowserConfig {
    const appUrl = persona.app ? this.config.appUrls?.[persona.app] : undefined
    return appUrl ? { ...this.config, appUrl } : this.config
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
