import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { pollUntil } from '@pikku/core/workflow'
import type { PikkuBrowserWire, TestIdSelector } from '@pikku/core/workflow'
import type { BrowserConfig } from './config.js'
import { locateTestId, type LocateTestIdOptions } from './testid.js'

/** Runtime problems collected for one page navigation. */
export interface PageIssues {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  apiErrors: string[]
}

/**
 * ActorSession — one actor's own browser context: an isolated window, cookie
 * jar, and session. Multi-actor scenarios ("the admin" publishes, "a member"
 * sees it live) each get their own ActorSession under one shared Browser.
 *
 * Every navigation collects console errors, uncaught exceptions, failed
 * requests, and 4xx/5xx app /api responses so a failing step can say exactly
 * what went wrong on which page.
 *
 * This is the object handed to a step as `wire.browser`, so a step reaches
 * Playwright through `wire.browser.page`.
 */
export class ActorSession implements PikkuBrowserWire {
  page!: Page
  context!: BrowserContext
  private issues: PageIssues = blankIssues()
  private inflightApi = 0

  constructor(
    readonly actor: string,
    private readonly config: BrowserConfig
  ) {}

  async open(browser: Browser) {
    this.context = await browser.newContext({
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
      locale: this.config.locale,
    })
    await this.context.addInitScript((apiUrl) => {
      ;(window as typeof window & { __E2E_API_URL?: string }).__E2E_API_URL =
        apiUrl
    }, this.config.apiUrl)
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(this.config.timeout)

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.issues.consoleErrors.push(msg.text().slice(0, 500))
      }
    })
    this.page.on('pageerror', (err) => {
      this.issues.pageErrors.push(String(err?.message ?? err).slice(0, 500))
    })
    this.page.on('requestfailed', (req) => {
      const failure = req.failure()
      this.issues.failedRequests.push(
        `${req.method()} ${req.url()} — ${failure?.errorText ?? 'failed'}`.slice(
          0,
          300
        )
      )
    })
    this.page.on('response', (res) => {
      try {
        const path = new URL(res.url()).pathname
        if (
          path.startsWith('/api/') &&
          !path.startsWith('/api/auth/') &&
          res.status() >= 400
        ) {
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
      if (isApiPath(req.url())) {
        this.inflightApi = Math.max(0, this.inflightApi - 1)
      }
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

  /** Navigate within the app; the structural `goto` of PikkuBrowserWire. */
  async goto(path: string): Promise<void> {
    await this.gotoApp(path)
  }

  async screenshot(name?: string): Promise<Uint8Array> {
    return this.page.screenshot(name ? { path: name } : undefined)
  }

  /**
   * Resolve an element by its test id — the shared way a browser step names
   * what it is acting on. Returns every match, so a step can count them or
   * narrow to `.first()` itself.
   */
  locate(selector: TestIdSelector, options?: LocateTestIdOptions): Locator {
    return locateTestId(this.page, selector, options)
  }

  /** Navigate within the app; returns the main document HTTP status. */
  async gotoApp(path: string): Promise<number | null> {
    this.inflightApi = 0
    const res = await this.page.goto(this.url(path), {
      waitUntil: 'domcontentloaded',
    })
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
   * and a real bug to surface, not a restart). Uses plain fetch (no page
   * navigation / cookies touched).
   */
  async waitForServerReady(maxMs = 30_000) {
    await pollUntil(
      async () => {
        try {
          const res = await fetch(this.url('/api/auth/get-session'), {
            method: 'GET',
            signal: AbortSignal.timeout(5_000),
          })
          const s = res.status
          return s !== 502 && s !== 503 && s !== 504 ? true : undefined
        } catch {
          // Connection refused/reset — server not back yet; keep polling.
          return undefined
        }
      },
      { timeoutMs: maxMs, intervalMs: 500 }
    )
  }

  /** Resolve once in-flight /api requests have drained (stably), or the cap elapses. */
  private async waitForApiQuiet(maxMs: number) {
    let quietSince = 0
    await pollUntil(
      () => {
        if (this.inflightApi > 0) {
          quietSince = 0
          return undefined
        }
        if (!quietSince) {
          quietSince = Date.now()
          return undefined
        }
        return Date.now() - quietSince >= 150 ? true : undefined
      },
      { timeoutMs: maxMs, intervalMs: 50 }
    )
  }

  async logout() {
    await this.context.clearCookies()
    await this.gotoApp('/')
  }

  /** Assert visible text, polling until the timeout (handles late renders). */
  async expectText(text: string, timeout = this.config.timeout) {
    const locator = this.page.getByText(text, { exact: false })
    const seen = await pollUntil(
      async () => {
        const count = await locator.count()
        for (let i = 0; i < count; i++) {
          if (
            await locator
              .nth(i)
              .isVisible()
              .catch(() => false)
          ) {
            return true
          }
        }
        return undefined
      },
      { timeoutMs: timeout, intervalMs: 100 }
    )
    if (!seen) {
      throw new Error(
        `Timed out waiting for visible text (${this.actor}): ${text}`
      )
    }
  }

  async getPageText(): Promise<string> {
    return this.page.innerText('body')
  }
}

function blankIssues(): PageIssues {
  return {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    apiErrors: [],
  }
}

function isApiPath(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/api/')
  } catch {
    return false
  }
}
