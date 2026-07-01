import { randomUUID } from 'node:crypto'
import type { Browser } from 'puppeteer-core'
import type {
  BrowserLaunchOptions,
  BrowserLimits,
  BrowserService,
  BrowserSession,
  BrowserSessionInfo,
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
  /**
   * Path to a system Chrome/Chromium. Defaults to $PUPPETEER_EXECUTABLE_PATH,
   * else puppeteer-core resolves the installed `chrome` channel. Nothing is ever
   * downloaded — a browser must already be present on the host/image.
   */
  executablePath?: string
  maxConcurrentSessions?: number
}

interface LocalSession {
  sessionId: string
  browser: Browser
  startTime: number
  attached: boolean
  keepAlive?: number
  idleTimer?: ReturnType<typeof setTimeout>
}

/**
 * Node fallback for `BrowserService` used in local dev, sandboxes and the pool
 * `server`-target runtime. Holds launched browsers in an in-process keep-alive
 * pool so the session API (`acquire`/`launch`/`connect`/`sessions`) reuses warm
 * Chromium across requests — the same behaviour Cloudflare provides natively.
 *
 * `puppeteer-core` is lazy-imported inside `launch`, so a project that only ever
 * runs on Cloudflare (where the browser is provided) never needs it installed.
 * We use puppeteer-core, NOT puppeteer, so installing it never downloads a
 * Chromium binary — `launch` runs against a system/remote browser via
 * `executablePath` ($PUPPETEER_EXECUTABLE_PATH) or the installed `chrome` channel.
 *
 * The `puppeteer-core` peer is pinned (package.json → 22.13.1) to the exact
 * version `@cloudflare/puppeteer` forks, so a project renders identically locally
 * and on Cloudflare. That pin is the source of truth `pikku fabric validate`
 * checks; bump it in lockstep with `@cloudflare/puppeteer` (and the injector).
 */
export class LocalBrowserService implements BrowserService {
  private readonly sessions_ = new Map<string, LocalSession>()
  private readonly logger?: BrowserLogger
  private readonly launchArgs: string[]
  private readonly executablePath?: string
  private readonly maxConcurrentSessions: number
  private puppeteerMod?: any

  constructor(options: LocalBrowserServiceOptions = {}) {
    this.logger = options.logger
    this.launchArgs = options.launchArgs ?? [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
    this.executablePath =
      options.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH
    this.maxConcurrentSessions = options.maxConcurrentSessions ?? 3
  }

  async acquire(opts?: BrowserLaunchOptions): Promise<BrowserSession> {
    for (const session of this.sessions_.values()) {
      if (!session.attached) {
        this.attach(session, opts?.keepAlive)
        return this.toSession(session)
      }
    }
    return this.launch(opts)
  }

  async launch(opts?: BrowserLaunchOptions): Promise<BrowserSession> {
    const puppeteer = await this.loadPuppeteer()
    // puppeteer-core never downloads Chromium — point it at a system browser
    // via executablePath, else let it resolve the installed `chrome` channel.
    const browser: Browser = await puppeteer.launch({
      headless: true,
      args: this.launchArgs,
      ...(this.executablePath
        ? { executablePath: this.executablePath }
        : { channel: 'chrome' }),
    })
    const session: LocalSession = {
      sessionId: randomUUID(),
      browser,
      startTime: Date.now(),
      attached: false,
    }
    this.sessions_.set(session.sessionId, session)
    this.attach(session, opts?.keepAlive)
    return this.toSession(session)
  }

  async connect(sessionId: string): Promise<BrowserSession> {
    const session = this.sessions_.get(sessionId)
    if (!session) {
      throw new Error(`No live browser session with id ${sessionId}`)
    }
    this.attach(session)
    return this.toSession(session)
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

  private toSession(session: LocalSession): BrowserSession {
    return {
      sessionId: session.sessionId,
      browser: session.browser,
      release: async () => this.release(session),
    }
  }

  private attach(session: LocalSession, keepAlive?: number): void {
    session.attached = true
    if (keepAlive !== undefined) session.keepAlive = keepAlive
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = undefined
    }
  }

  /** Mark the session idle and, per keepAlive, schedule it to end (CF keep_alive). */
  private release(session: LocalSession): void {
    session.attached = false
    if (session.idleTimer) clearTimeout(session.idleTimer)
    if (session.keepAlive && session.keepAlive > 0) {
      session.idleTimer = setTimeout(() => {
        void this.endSession(session.sessionId)
      }, session.keepAlive)
    }
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

  private async loadPuppeteer(): Promise<any> {
    if (!this.puppeteerMod) {
      const mod = await this.load('puppeteer-core', 'puppeteer-core')
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
