import {
  request as playwrightRequest,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import type { BrowserConfig, PersonaCredentials } from './config.js'

/** Runtime problems collected for one page navigation. */
export interface PageIssues {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  apiErrors: string[]
}

/**
 * What the client factory receives: the API base URL plus the actor's current
 * session as a Cookie header, so the generated PikkuRPC/PikkuFetch clients act
 * AS this actor.
 */
export interface ClientContext {
  apiUrl: string
  cookieHeader: string | null
}

/**
 * ActorSession — one actor's own browser context: an isolated window, cookie
 * jar, and session. Multi-actor scenarios ("the admin" publishes, "a member"
 * sees it live) each get their own ActorSession under one shared Browser.
 *
 * Every navigation collects console errors, uncaught exceptions, failed
 * requests, and 4xx/5xx app /api responses so a failing step can say exactly
 * what went wrong on which page.
 */
export class ActorSession<Clients = unknown> {
  page!: Page
  private context!: BrowserContext
  private issues: PageIssues = blankIssues()
  private inflightApi = 0
  private signedInAs?: string

  constructor(
    readonly name: string,
    readonly persona: PersonaCredentials,
    private readonly config: BrowserConfig,
    private readonly clientFactory?: (ctx: ClientContext) => Clients
  ) {}

  /**
   * The app's generated, fully-typed pikku clients (PikkuRPC/PikkuFetch),
   * built by the world's `createClients` factory and carrying THIS actor's
   * session cookie. Types come from the generated client classes — never cast.
   */
  async clients(): Promise<Clients> {
    if (!this.clientFactory) {
      throw new Error(
        '[e2e] no client factory — override createClients() on your BrowserWorld subclass to wire the generated PikkuRPC/PikkuFetch'
      )
    }
    const cookies = await this.context.cookies()
    const cookieHeader = cookies.length
      ? cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      : null
    return this.clientFactory({ apiUrl: this.config.apiUrl, cookieHeader })
  }

  async open(browser: Browser) {
    this.context = await browser.newContext({
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
      locale: this.config.locale,
    })
    await this.context.addInitScript((apiUrl) => {
      ;(window as typeof window & { __E2E_API_URL?: string }).__E2E_API_URL = apiUrl
    }, this.config.apiUrl)
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(this.config.timeout)

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') this.issues.consoleErrors.push(msg.text().slice(0, 500))
    })
    this.page.on('pageerror', (err) => {
      this.issues.pageErrors.push(String(err?.message ?? err).slice(0, 500))
    })
    this.page.on('requestfailed', (req) => {
      const failure = req.failure()
      this.issues.failedRequests.push(
        `${req.method()} ${req.url()} — ${failure?.errorText ?? 'failed'}`.slice(0, 300)
      )
    })
    this.page.on('response', (res) => {
      try {
        const path = new URL(res.url()).pathname
        if (path.startsWith('/api/') && !path.startsWith('/api/auth/') && res.status() >= 400) {
          this.issues.apiErrors.push(`${res.status()} ${path}`)
        }
      } catch {
        // Non-absolute response URL — nothing to attribute; skip.
      }
    })
    // Track in-flight /api requests so a navigation can wait for the page's
    // initial RPCs to settle (and surface their errors) without a blanket
    // networkidle — it returns the instant they drain, capped for streaming routes.
    this.page.on('request', (req) => {
      if (isApiPath(req.url())) this.inflightApi += 1
    })
    const settleReq = (req: { url(): string }) => {
      if (isApiPath(req.url())) this.inflightApi = Math.max(0, this.inflightApi - 1)
    }
    this.page.on('requestfinished', settleReq)
    this.page.on('requestfailed', settleReq)
  }

  async close() {
    await this.context?.close()
  }

  resetIssues() {
    this.issues = blankIssues()
  }

  takeIssues(): PageIssues {
    return {
      consoleErrors: [...new Set(this.issues.consoleErrors)],
      pageErrors: [...new Set(this.issues.pageErrors)],
      failedRequests: [...new Set(this.issues.failedRequests)],
      apiErrors: [...new Set(this.issues.apiErrors)],
    }
  }

  url(path: string): string {
    if (path.startsWith('http')) return path
    return `${this.config.appUrl}${path.startsWith('/') ? path : `/${path}`}`
  }

  /** Navigate within the app; returns the main document HTTP status. */
  async gotoApp(path: string): Promise<number | null> {
    this.inflightApi = 0
    const res = await this.page.goto(this.url(path), { waitUntil: 'domcontentloaded' })
    // App shell mounted (or the app's own hydration marker set) — instant on a
    // prerendered/SSR page. No blanket networkidle: a bare page (no shell)
    // still has its errors collected below.
    await this.page
      .waitForSelector(
        'html[data-app-hydrated="true"], #root > *, #app > *, main, [role="main"], nav',
        { state: 'attached', timeout: 4_000 }
      )
      .catch(() => {})
    // Let the page's initial /api RPCs settle so 4xx/5xx surface as apiErrors,
    // without waiting on persistent streams (SSE/long-poll never go idle).
    await this.waitForApiQuiet(2_500)
    return res?.status() ?? null
  }

  /**
   * Wait until the app server is REACHABLE again. Dev servers restart on file
   * changes; while down the edge returns a gateway error (502/503/504) — or the
   * connection is refused — on /api. Poll get-session until it answers anything
   * that isn't a gateway error (a 2xx/401, or even a 500: that's the server up,
   * and a real bug to surface, not a restart). Uses a throwaway request context
   * (no page navigation / cookies touched).
   */
  async waitForServerReady(maxMs = 30_000) {
    const api = await playwrightRequest.newContext({
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
    })
    try {
      const deadline = Date.now() + maxMs
      while (Date.now() < deadline) {
        try {
          const res = await api.get(this.url('/api/auth/get-session'), {
            headers: { origin: this.config.appUrl },
            failOnStatusCode: false,
            timeout: 5_000,
          })
          const s = res.status()
          if (s !== 502 && s !== 503 && s !== 504) return
        } catch {
          // Connection refused/reset — server not back yet; keep polling.
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      await api.dispose()
    }
  }

  /** Resolve once in-flight /api requests have drained (stably), or the cap elapses. */
  private async waitForApiQuiet(maxMs: number) {
    const deadline = Date.now() + maxMs
    let quietSince = 0
    while (Date.now() < deadline) {
      if (this.inflightApi <= 0) {
        if (!quietSince) quietSince = Date.now()
        else if (Date.now() - quietSince >= 150) return
      } else {
        quietSince = 0
      }
      await this.page.waitForTimeout(50)
    }
  }

  /**
   * Ensure this actor's context holds a logged-in session for its persona.
   * Signs the account up (or in, if it already exists) via Better Auth using
   * the context's own request client, so the cookies land in this context and
   * carry to page navigations. Over https the Secure cookie is honoured.
   */
  async signIn(credentials: PersonaCredentials = this.persona) {
    if (this.signedInAs === credentials.email) return
    const headers = { 'content-type': 'application/json', origin: this.config.appUrl }
    let res = await this.context.request.post(this.url('/api/auth/sign-up/email'), {
      headers,
      data: {
        email: credentials.email,
        password: credentials.password,
        name: credentials.name ?? this.name,
      },
      failOnStatusCode: false,
    })
    if (!res.ok()) {
      res = await this.context.request.post(this.url('/api/auth/sign-in/email'), {
        headers,
        data: { email: credentials.email, password: credentials.password },
        failOnStatusCode: false,
      })
    }
    if (!res.ok()) {
      throw new Error(
        `[e2e] sign-in for ${this.name} failed (${res.status()}): ${(await res.text()).slice(0, 300)}`
      )
    }
    this.signedInAs = credentials.email
  }

  /**
   * Ensure the persona's account exists WITHOUT logging this context in (uses
   * a throwaway request context). Use before driving the login form, so the
   * form isn't auto-redirected away by an existing session.
   */
  async ensureAccount(credentials: PersonaCredentials = this.persona) {
    const api = await playwrightRequest.newContext({
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
    })
    try {
      const headers = { 'content-type': 'application/json', origin: this.config.appUrl }
      const res = await api.post(this.url('/api/auth/sign-up/email'), {
        headers,
        data: {
          email: credentials.email,
          password: credentials.password,
          name: credentials.name ?? this.name,
        },
        failOnStatusCode: false,
      })
      // 200 → created; a 4xx here usually means "already exists", which is fine.
      if (!res.ok() && res.status() >= 500) {
        throw new Error(
          `[e2e] ensureAccount failed (${res.status()}): ${(await res.text()).slice(0, 300)}`
        )
      }
    } finally {
      await api.dispose()
    }
  }

  /** Drive the real login form (proves the UI form works). */
  async loginViaForm(credentials: PersonaCredentials = this.persona) {
    await this.gotoApp('/login')
    await this.page.locator('input[type="email"]').fill(credentials.email)
    await this.page.locator('input[type="password"]').fill(credentials.password)
    await this.page
      .locator('button[type="submit"], button:has-text("sign in"), button:has-text("login"), button:has-text("anmelden")')
      .first()
      .click()
    await this.page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: this.config.timeout,
    })
    this.signedInAs = credentials.email
  }

  async logout() {
    await this.context.clearCookies()
    this.signedInAs = undefined
    await this.gotoApp('/')
  }

  /** Assert visible text, polling until the timeout (handles late renders). */
  async expectText(text: string, timeout = this.config.timeout) {
    const locator = this.page.getByText(text, { exact: false })
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const count = await locator.count()
      for (let i = 0; i < count; i++) {
        if (
          await locator
            .nth(i)
            .isVisible()
            .catch(() => false)
        ) {
          return
        }
      }
      await this.page.waitForTimeout(100)
    }
    throw new Error(`Timed out waiting for visible text (${this.name}): ${text}`)
  }

  async getPageText(): Promise<string> {
    return this.page.innerText('body')
  }
}

function blankIssues(): PageIssues {
  return { consoleErrors: [], pageErrors: [], failedRequests: [], apiErrors: [] }
}

function isApiPath(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/api/')
  } catch {
    return false
  }
}
