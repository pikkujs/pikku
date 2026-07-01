import { randomUUID } from 'node:crypto'
import type {
  BrowserLaunchOptions,
  BrowserLimits,
  BrowserService,
  BrowserSession,
  BrowserSessionInfo,
  PikkuBrowser,
  PikkuStagehand,
  StagehandLaunchOptions,
} from './browser-service.interface.js'

interface BrowserLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

interface LocalBrowserServiceOptions {
  logger?: BrowserLogger
  /** Chromium launch flags; defaults suit containers (no sandbox). */
  launchArgs?: string[]
  maxConcurrentSessions?: number
}

interface LocalSession {
  sessionId: string
  browser: any
  startTime: number
  attached: boolean
  idleTimer?: ReturnType<typeof setTimeout>
}

/**
 * Node fallback for `BrowserService` used in local dev, sandboxes and the pool
 * `server`-target runtime. Holds launched browsers in an in-process keep-alive
 * pool so the session API (`acquire`/`launch`/`connect`/`sessions`) reuses warm
 * Chromium across requests — the same behaviour Cloudflare provides natively.
 *
 * puppeteer / playwright / @browserbasehq/stagehand are lazy-imported inside the
 * relevant method, so a project only needs to install the one it actually calls.
 *
 * The `puppeteer` peer is pinned (package.json → 22.13.1) to the exact core that
 * `@cloudflare/puppeteer` vendors, so a project renders identically locally and
 * on Cloudflare. That pin is the source of truth `pikku fabric validate` checks
 * against; bump it in lockstep with `@cloudflare/puppeteer` (and the injector).
 */
export class LocalBrowserService implements BrowserService {
  private readonly sessions_ = new Map<string, LocalSession>()
  private readonly logger?: BrowserLogger
  private readonly launchArgs: string[]
  private readonly maxConcurrentSessions: number
  private puppeteerMod?: any

  constructor(options: LocalBrowserServiceOptions = {}) {
    this.logger = options.logger
    this.launchArgs = options.launchArgs ?? [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
    this.maxConcurrentSessions = options.maxConcurrentSessions ?? 3
  }

  async acquire(opts?: BrowserLaunchOptions): Promise<BrowserSession> {
    for (const session of this.sessions_.values()) {
      if (!session.attached) {
        this.attach(session, opts?.keepAlive)
        return { sessionId: session.sessionId, browser: this.wrap(session) }
      }
    }
    return this.launch(opts)
  }

  async launch(opts?: BrowserLaunchOptions): Promise<BrowserSession> {
    const puppeteer = await this.loadPuppeteer()
    const browser = await puppeteer.launch({
      headless: true,
      args: this.launchArgs,
    })
    const session: LocalSession = {
      sessionId: randomUUID(),
      browser,
      startTime: Date.now(),
      attached: false,
    }
    this.sessions_.set(session.sessionId, session)
    this.attach(session, opts?.keepAlive)
    return { sessionId: session.sessionId, browser: this.wrap(session) }
  }

  async connect(sessionId: string): Promise<BrowserSession> {
    const session = this.sessions_.get(sessionId)
    if (!session) {
      throw new Error(`No live browser session with id ${sessionId}`)
    }
    this.attach(session)
    return { sessionId: session.sessionId, browser: this.wrap(session) }
  }

  async sessions(): Promise<BrowserSessionInfo[]> {
    return [...this.sessions_.values()].map((s) => ({
      sessionId: s.sessionId,
      startTime: s.startTime,
      connectionId: s.attached ? s.sessionId : undefined,
    }))
  }

  async limits(): Promise<BrowserLimits> {
    return {
      activeSessions: this.sessions_.size,
      maxConcurrentSessions: this.maxConcurrentSessions,
      allowedBrowserAcquisitions: Math.max(
        0,
        this.maxConcurrentSessions - this.sessions_.size
      ),
    }
  }

  async getStagehand(opts?: StagehandLaunchOptions): Promise<PikkuStagehand> {
    const baseURL = process.env.LITELLM_PROXY_URL
    const apiKey =
      process.env.LITELLM_BUILDER_API_KEY || process.env.LITELLM_API_KEY
    if (!baseURL || !apiKey) {
      throw new Error(
        'Stagehand needs LITELLM_PROXY_URL and LITELLM_BUILDER_API_KEY (or LITELLM_API_KEY) to route its LLM through the Fabric proxy'
      )
    }
    const mod = await this.load(
      '@browserbasehq/stagehand',
      '@browserbasehq/stagehand'
    )
    const Stagehand = mod.Stagehand ?? mod.default?.Stagehand ?? mod.default
    const stagehand = new Stagehand({
      env: 'LOCAL',
      modelName: opts?.modelName ?? 'openai/gpt-4o-mini',
      modelClientOptions: { apiKey, baseURL },
      localBrowserLaunchOptions: { args: this.launchArgs },
      verbose: 0,
    })
    await stagehand.init()
    return {
      page: stagehand.page as any,
      act: (instruction: string) => stagehand.act(instruction),
      extract: (args: any) => stagehand.extract(args),
      observe: (instruction?: string) => stagehand.observe(instruction),
      close: () => stagehand.close(),
    }
  }

  async getPlaywright(opts?: BrowserLaunchOptions): Promise<PikkuBrowser> {
    const mod = await this.load('playwright', 'playwright')
    const chromium = mod.chromium ?? mod.default?.chromium
    const browser = await chromium.launch({
      headless: true,
      args: this.launchArgs,
    })
    const session: LocalSession = {
      sessionId: randomUUID(),
      browser,
      startTime: Date.now(),
      attached: true,
    }
    this.sessions_.set(session.sessionId, session)
    if (opts?.keepAlive) this.attach(session, opts.keepAlive)
    return this.wrap(session)
  }

  /** Close every pooled browser — call on runtime shutdown. */
  async shutdown(): Promise<void> {
    for (const session of this.sessions_.values()) {
      if (session.idleTimer) clearTimeout(session.idleTimer)
      try {
        await session.browser.close()
      } catch (err) {
        this.logger?.warn(
          `Failed to close browser session ${session.sessionId}: ${String(err)}`
        )
      }
    }
    this.sessions_.clear()
  }

  private attach(session: LocalSession, keepAlive?: number): void {
    session.attached = true
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = undefined
    }
    if (keepAlive && keepAlive > 0) {
      // Emulate CF keep_alive: end the session after it stays idle this long.
      session.idleTimer = setTimeout(() => {
        void this.endSession(session.sessionId)
      }, keepAlive)
    }
  }

  private detach(session: LocalSession): void {
    session.attached = false
  }

  private async endSession(sessionId: string): Promise<void> {
    const session = this.sessions_.get(sessionId)
    if (!session) return
    this.sessions_.delete(sessionId)
    if (session.idleTimer) clearTimeout(session.idleTimer)
    try {
      await session.browser.close()
    } catch (err) {
      this.logger?.warn(
        `Failed to close browser session ${sessionId}: ${String(err)}`
      )
    }
  }

  private wrap(session: LocalSession): PikkuBrowser {
    return {
      newPage: () => session.browser.newPage(),
      disconnect: async () => {
        // Keep the session warm for reuse; just mark the client detached.
        this.detach(session)
      },
      close: () => this.endSession(session.sessionId),
    }
  }

  private async loadPuppeteer(): Promise<any> {
    if (!this.puppeteerMod) {
      const mod = await this.load('puppeteer', 'puppeteer')
      this.puppeteerMod = mod.default ?? mod
    }
    return this.puppeteerMod
  }

  /** Lazy dynamic import via a non-literal specifier so the optional lib is
   *  only required when its method is actually called. */
  private async load(name: string, install: string): Promise<any> {
    const specifier: string = name
    try {
      return await import(specifier)
    } catch (err) {
      throw new Error(
        `Browser automation via "${name}" requires the optional peer dependency to be installed (\`npm install ${install}\`). Underlying error: ${String(err)}`
      )
    }
  }
}
