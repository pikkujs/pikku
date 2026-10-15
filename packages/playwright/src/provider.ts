import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Video } from '@playwright/test'
import type { ResolvedVirtualUser } from '@pikku/core/services'
import {
  authMount,
  deriveVirtualUserSecret,
  establishOperatorSession,
  IMPERSONATE_USER_ID_HEADER,
  type VirtualUserSecretResolver,
  type OperatorSignInOptions,
} from '@pikku/core/virtual-user'
import type {
  ScenarioArtifact,
  ScenarioBrowserFailure,
  ScenarioBrowserProvider,
} from '@pikku/core/scenario'
import {
  VirtualUserSession,
  type CaptureContext,
} from './virtual-user-session.js'
import {
  compressVideos,
  hasFfmpeg,
  slug,
  type CaptureOptions,
  type VideoHolds,
} from './capture.js'
import { connectOrLaunch, type BrowserConnection } from './browser-launch.js'
import { browserConfigFromEnv, type BrowserConfig } from './config.js'

/**
 * Where Playwright drops its own recordings before retention files them.
 *
 * Its filenames are generated and carry no virtual user or scenario, so nothing is
 * meant to read this directory — it is emptied as the run ends.
 */
const VIDEO_STAGING_DIR = '.video-raw'

/** What the virtual user sign-in endpoint is posted, for one virtual user. */
export interface VirtualUserSignInRequest {
  email: string
  name: string
  /** Absent on a deployed stage, which has no virtual user secret to post. */
  secret?: string
}

/** Where the virtual user sign-in endpoint lives, and which origin it is called from. */
export interface VirtualUserSignInTarget {
  apiUrl: string
  appUrl: string
  signInPath: string
}

/**
 * Establish the virtual user's session inside its own browser context. Overridable so
 * a project on a different auth plugin can plant its own cookie.
 */
export type VirtualUserSecretSignIn = (
  context: BrowserContext,
  request: VirtualUserSignInRequest,
  target: VirtualUserSignInTarget
) => Promise<void>

export interface PlaywrightScenarioBrowserProviderOptions {
  config?: BrowserConfig
  /**
   * The ROOT virtual user secret — the same SCENARIO_VIRTUAL_USER_SECRET the HTTP virtual users
   * use — from which each virtual user's own credential is derived and bound to
   * their address. Pass an {@link VirtualUserSecretResolver} to browse as virtual users
   * whose credentials were minted elsewhere, without holding the root.
   *
   * The local-development credential; a deployed stage passes
   * {@link PlaywrightScenarioBrowserProviderOptions.operator} instead.
   */
  secret?: string | VirtualUserSecretResolver
  /**
   * Pikku Studio Cloud operator credentials, for browsing a DEPLOYED stage as a virtual user.
   * Same handshake the HTTP virtual users use, so a browser step and an RPC step in
   * one scenario still act as one user.
   */
  operator?: OperatorSignInOptions
  /** Virtual user name → the virtual user filling it, resolved from `defineVirtualUsers()`. */
  virtualUsers: Record<string, ResolvedVirtualUser>
  /** Sign-in path under apiUrl. Default: the virtual user plugin's `/auth/sign-in/virtual-user`. */
  signInPath?: string
  /**
   * Artifacts for this run — screenshots taken by name, and a video per
   * scenario kept according to `video`. Absent, or with `screenshots` off, a
   * step's `screenshot()` still returns bytes and writes nothing, so scenarios
   * do not have to know whether the flag is on.
   */
  capture?: CaptureOptions
  connectBrowser?: () => Promise<BrowserConnection>
  signIn?: VirtualUserSecretSignIn
}

/**
 * Hands scenario steps a browser, one isolated context per virtual user.
 *
 * The context signs in through the SAME virtual user path the HTTP virtual users use
 * (`signInPath` + the virtual user secret) rather than a virtual user email/password, so
 * `wire.browser` and `wire.scenarioStep.virtualUser` are the same identity — a
 * browser step and an RPC step in one scenario act as one user.
 */
/**
 * Send the impersonation header to the product's own origins and nowhere else.
 *
 * `setExtraHTTPHeaders` would be one line, but it stamps every request the
 * context makes — analytics, fonts, any third-party subresource a page pulls —
 * and telling an unrelated host which user this run is acting as is not
 * something a test should do. Routing is the origin-aware alternative, and
 * `fallback` rather than `continue` so a project's own route handlers still see
 * the request.
 */
const impersonateOn = async (
  context: BrowserContext,
  userId: string,
  origins: string[]
): Promise<void> => {
  const trusted = new Set(origins.map((url) => new URL(url).origin))
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (!trusted.has(new URL(request.url()).origin)) {
      return route.fallback()
    }
    return route.fallback({
      headers: {
        ...request.headers(),
        [IMPERSONATE_USER_ID_HEADER]: userId,
      },
    })
  })
}

export class PlaywrightScenarioBrowserProvider implements ScenarioBrowserProvider {
  private readonly config: BrowserConfig
  private sessions = new Map<string, Promise<VirtualUserSession>>()
  private connection?: Promise<BrowserConnection>
  /**
   * The capture state for the scenario currently running, handed to every
   * session by reference so the scenario name and the capture count are shared
   * rather than copied per virtual user.
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
  /**
   * Where each virtual user's current recording should hold, as raw offsets. Moved
   * onto the filed video when its context closes, and applied by the encode.
   */
  private videoMarks = new Map<string, number[]>()
  /** Hold points for each kept recording, by its path in the ledger. */
  private videoHolds = new Map<string, number[]>()
  /**
   * Whether kept recordings will be encoded, which is the only place holds
   * happen. Settled before the first step is stamped, because a step's offset
   * has to say where it lands in the footage somebody will actually watch.
   */
  private encodesVideo = false

  constructor(
    private readonly options: PlaywrightScenarioBrowserProviderOptions
  ) {
    this.config = options.config ?? browserConfigFromEnv()
    if (options.capture) {
      // Built once and handed to every session by reference, so the scenario
      // name, the capture count and the ledger are shared rather than copied
      // per virtual user — a two-virtual-user scenario numbers its images in the order they
      // were taken, not once per window.
      this.captureContext = {
        dir: options.capture.dir,
        runId: options.capture.runId,
        screenshots: options.capture.screenshots === true,
        taken: 0,
        filed: [],
        videoStartedAt: new Map(),
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

  /**
   * When this virtual user's recording started — the moment their context was opened
   * with `recordVideo`, which is when Playwright starts the file. Absent for a
   * run that records nothing and for a virtual user with no window open.
   */
  videoStartedAt(virtualUserName: string): number | undefined {
    return this.captureContext?.videoStartedAt.get(virtualUserName)
  }

  /**
   * Mark a browser step starting in this virtual user's recording, and answer where
   * it will fall in the encoded video.
   *
   * The encode freezes the frame at each mark for `videoStepHoldMs`, so every
   * earlier mark pushes this one later by one hold. The run itself never
   * waits. Without an encode there are no holds and the offset is the raw one.
   */
  markVideoStep(virtualUserName: string): number | undefined {
    const startedAt = this.videoStartedAt(virtualUserName)
    if (startedAt === undefined) {
      return undefined
    }
    const raw = Math.max(0, Date.now() - startedAt)
    const hold = this.config.videoStepHoldMs
    if (!this.encodesVideo || hold <= 0) {
      return raw
    }
    const marks = this.videoMarks.get(virtualUserName) ?? []
    this.videoMarks.set(virtualUserName, [...marks, raw])
    return raw + marks.length * hold
  }

  async sessionFor(virtualUserName: string): Promise<VirtualUserSession> {
    const existing = this.sessions.get(virtualUserName)
    if (existing) {
      return existing
    }
    const virtualUserConfig = this.options.virtualUsers[virtualUserName]
    if (!virtualUserConfig) {
      throw new Error(
        `[scenario] browser virtual user '${virtualUserName}' has no virtual user — add it to a defineVirtualUsers({ ... }) call`
      )
    }
    // Cache the promise, not the resolved session, so two steps racing for the
    // same virtual user share one window instead of opening two.
    const opening = this.openSession(virtualUserName, virtualUserConfig).catch(
      (err) => {
        this.sessions.delete(virtualUserName)
        throw err
      }
    )
    this.sessions.set(virtualUserName, opening)
    return opening
  }

  /**
   * Close every virtual user's context, keeping the browser. The next `sessionFor`
   * opens a fresh context and re-runs the virtual user sign-in, so a scenario starts
   * with no cookies, no storage and no pages from the one before it.
   */
  async reset(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    // The recordings these timestamps address are finalised by the closes
    // below; the next scenario's windows start their own files.
    this.captureContext?.videoStartedAt.clear()
    const marks = this.videoMarks
    this.videoMarks = new Map()
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
      await this.retainVideo(
        video,
        resolved.virtualUser,
        scenario,
        keep,
        marks.get(resolved.virtualUser) ?? []
      )
    }
  }

  /**
   * File this window's recording under the scenario that produced it, or throw
   * it away.
   *
   * Filing happens here rather than at record time because Playwright names
   * the file itself and only finalises it on close, so a recording is
   * attributable to a virtual user and a scenario for exactly this one moment.
   */
  private async retainVideo(
    video: Video | undefined,
    virtualUser: string,
    scenario: string | undefined,
    keep: boolean,
    marks: number[]
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
        const path = `${slug(label)}/${slug(virtualUser)}.webm`
        await mkdir(join(capture.dir, capture.runId, slug(label)), {
          recursive: true,
        })
        await video.saveAs(join(capture.dir, capture.runId, path))
        this.videoHolds.set(path, marks)
        this.captureContext?.filed.push({
          scenario: label,
          kind: 'video',
          path,
          virtualUser,
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
    for (const [virtualUserName, pending] of this.sessions) {
      const session = await pending.catch(() => undefined)
      if (!session) {
        continue
      }
      const failure: ScenarioBrowserFailure = {
        virtualUser: virtualUserName,
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
          const path = `${slug(label)}/failure-${slug(virtualUserName)}.png`
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
            virtualUser: virtualUserName,
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
    const holds = new Map(
      videos.map((artifact) => [
        absolute(artifact),
        this.videoHolds.get(artifact.path),
      ])
    )
    const hold = this.config.videoStepHoldMs
    const holdsFor = (file: string): VideoHolds | undefined => {
      const atMs = holds.get(file)
      return atMs && hold > 0 ? { atMs, holdMs: hold } : undefined
    }
    const renamed = await compressVideos(
      videos.map(absolute),
      undefined,
      holdsFor
    ).catch(() => new Map<string, string>())
    for (const artifact of videos) {
      const to = renamed.get(absolute(artifact))
      if (to) {
        artifact.path = artifact.path.replace(/\.webm$/, '.mp4')
      }
    }
  }

  private async openSession(
    virtualUserName: string,
    virtualUserConfig: ResolvedVirtualUser
  ): Promise<VirtualUserSession> {
    const { browser } = await this.browser()
    const config = this.configFor(virtualUserConfig)
    const session = new VirtualUserSession(virtualUserName, config)
    const capture = this.options.capture
    const recording = Boolean(capture && capture.video !== 'off')
    await session.open(
      browser,
      recording
        ? join(capture!.dir, capture!.runId, VIDEO_STAGING_DIR)
        : undefined
    )
    if (this.captureContext) {
      session.capture = this.captureContext
      if (recording) {
        // Stamped once the context exists rather than before the call: the file
        // starts with the context, and the sign-in that follows is already part
        // of the footage.
        this.captureContext.videoStartedAt.set(virtualUserName, Date.now())
        this.encodesVideo = capture!.compress !== false && (await hasFfmpeg())
      }
    }
    const signIn = this.options.signIn ?? this.defaultSignIn(virtualUserConfig)
    const secret =
      typeof this.options.secret === 'function'
        ? await this.options.secret(virtualUserConfig)
        : this.options.secret
          ? await deriveVirtualUserSecret(
              this.options.secret,
              virtualUserConfig.email
            )
          : undefined
    await signIn(
      session.context,
      {
        email: virtualUserConfig.email,
        name: virtualUserConfig.name ?? virtualUserName,
        secret,
      },
      {
        apiUrl: config.apiUrl,
        appUrl: config.appUrl,
        signInPath: this.options.signInPath ?? '/auth/sign-in/virtual-user',
      }
    )
    return session
  }

  /**
   * How a context gets its session when the project has not supplied its own
   * `signIn`. The operator path wins when both credentials are present, for the
   * same reason it does on the HTTP side: it is the stronger of the two.
   */
  private defaultSignIn(
    virtualUser: ResolvedVirtualUser
  ): VirtualUserSecretSignIn {
    const operator = this.options.operator
    if (!operator) {
      return defaultVirtualUserSignIn
    }
    return async (context, _request, target) => {
      const mount = authMount(this.options.signInPath)
      const { setCookies, userId } = await establishOperatorSession(
        fetch,
        target.apiUrl,
        virtualUser,
        {
          ...operator,
          signInPath:
            operator.signInPath ??
            (mount ? `${mount}/sign-in/cloud` : undefined),
        },
        { origin: new URL(target.appUrl).origin }
      )
      await context.addCookies(
        setCookies.map((raw: string) => parseCookie(raw, target.appUrl))
      )
      await impersonateOn(context, userId, [target.apiUrl, target.appUrl])
    }
  }

  /**
   * The config this virtual user browses with — their own app's base url.
   *
   * A person signs into one app, so the virtual user's `app` is the whole answer: it
   * decides what `/dashboard` means for them, and which origin their session
   * cookie is planted on. Everything downstream (`url()`, `gotoApp`, the
   * sign-in Origin header, `parseCookie`) reads it off the session's config, so
   * choosing it here is the only place that has to know.
   *
   * An unnamed app, or one no url was given for, falls back to the single
   * `appUrl` — which is the whole story for the common one-app project.
   */
  private configFor(virtualUser: ResolvedVirtualUser): BrowserConfig {
    const appUrl = virtualUser.app
      ? this.config.appUrls?.[virtualUser.app]
      : undefined
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
 * Sign in via the Better Auth virtual user plugin and land its Set-Cookie headers in
 * this virtual user's browser context, so page navigations carry the session.
 */
const defaultVirtualUserSignIn: VirtualUserSecretSignIn = async (
  context,
  request,
  target
) => {
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
      `[scenario] browser virtual user sign-in failed for '${request.email}' (${res.status}): ${body}`
    )
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  if (setCookies.length === 0) {
    throw new Error(
      `[scenario] browser virtual user sign-in for '${request.email}' returned no session cookie`
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
