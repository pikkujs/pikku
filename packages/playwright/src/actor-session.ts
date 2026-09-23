import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  Browser,
  BrowserContext,
  Locator,
  Page,
  Video,
} from '@playwright/test'
import { pollUntil } from '@pikku/core/scenario'
import type { TestIdSelector } from '@pikku/core/scenario'
import type {
  PikkuBrowserWire,
  ScenarioArtifact,
  ScenarioScreenshotOptions,
} from '@pikku/core/scenario'
import type { BrowserConfig } from './config.js'
import { slug } from './capture.js'
import { locateTestId, type LocateTestIdOptions } from './testid.js'

/**
 * Where a capture is filed, and what it is filed under.
 *
 * Stamped rather than derived: a screenshot is only useful later if you can say
 * which run and which scenario produced it, and neither is knowable from inside
 * a step.
 */
export interface CaptureContext {
  /** Root directory for this run's captures. */
  dir: string
  /** The run these captures belong to. */
  runId: string
  /** The scenario currently executing, set by the provider as each one starts. */
  scenario?: string
  /**
   * Write the screenshots a scenario asks for by name.
   *
   * Separate from the context existing at all: recording video needs a capture
   * context on every run, and that must not silently turn `--screenshots` on.
   */
  screenshots: boolean
  /**
   * Captures taken so far in the current scenario, across every actor.
   *
   * One object is shared by reference between the actors' sessions rather than
   * counted per session, because the number leads the filename and is there to
   * give a directory listing the order the run happened in. Counted per actor
   * it restarts at 01 for the second window, and describes an order that never
   * occurred.
   */
  taken: number
  /**
   * Everything this run has filed, in the order it was filed.
   *
   * The ledger the runner reads back, shared by reference with the provider:
   * an image is only findable later if something recorded which scenario and
   * which actor produced it, and a directory listing cannot say.
   */
  filed: ScenarioArtifact[]
  /**
   * When each actor's recording started, as epoch milliseconds, for the actors
   * whose context is currently open with video on.
   *
   * Shared by reference like the rest of this object, because the offset a step
   * is stamped with is read through the provider while the session that set it
   * is somewhere else entirely. Cleared by `reset()`, which is what closes the
   * contexts and finalises the files these timestamps address.
   */
  videoStartedAt: Map<string, number>
}

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
/**
 * A pointer drawn into recorded pages, since a headless window has none.
 *
 * It follows the real mouse events Playwright dispatches, and jumps to a field
 * a step fills without clicking. Playwright's own `showActions` animates each
 * action instead, which costs ~500ms of run time per action; this costs none,
 * and the encode's held frames give the eye time to find it. The position is
 * kept across navigations so the pointer does not vanish on every page load.
 */
const drawCursor = () => {
  const key = '__pikkuCursor'
  let at = { x: -40, y: -40 }
  try {
    at = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? at
  } catch {}
  let pointer: HTMLElement | undefined
  const place = () => {
    if (!pointer?.isConnected) {
      if (!document.documentElement) return
      pointer = document.createElement('div')
      pointer.setAttribute('aria-hidden', 'true')
      pointer.style.cssText =
        'position:fixed;left:0;top:0;width:28px;height:28px;pointer-events:none;z-index:2147483647;transition:transform 80ms linear'
      pointer.innerHTML =
        '<svg width="28" height="28" viewBox="0 0 22 22"><path d="M3 2l14 8.5-6.2 1.3 3.6 6.8-2.6 1.3-3.6-6.8L3 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
      document.documentElement.appendChild(pointer)
    }
    pointer.style.transform = `translate(${at.x - 4}px,${at.y - 3}px)`
  }
  const move = (x: number, y: number) => {
    at = { x, y }
    place()
    try {
      sessionStorage.setItem(key, JSON.stringify(at))
    } catch {}
  }
  addEventListener('mousemove', (e) => move(e.clientX, e.clientY), {
    capture: true,
    passive: true,
  })
  addEventListener(
    'focusin',
    (e) => {
      const box = (e.target as Element | null)?.getBoundingClientRect?.()
      if (
        !box ||
        (at.x >= box.left &&
          at.x <= box.right &&
          at.y >= box.top &&
          at.y <= box.bottom)
      ) {
        return
      }
      move(box.left + Math.min(box.width / 2, 24), box.top + box.height / 2)
    },
    true
  )
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', place)
  } else {
    place()
  }
}

export class ActorSession implements PikkuBrowserWire {
  page!: Page
  context!: BrowserContext
  private issues: PageIssues = blankIssues()
  private inflightApi = 0
  /** Set by the provider when captures are enabled; absent means no captures. */
  capture?: CaptureContext

  constructor(
    readonly actor: string,
    private readonly config: BrowserConfig
  ) {}

  async open(browser: Browser, recordVideoDir?: string) {
    // `size` pins the recording to the viewport; Playwright otherwise scales it
    // to fit 800x800.
    const recordVideo = recordVideoDir
      ? { dir: recordVideoDir, size: this.config.viewport }
      : undefined
    this.context = await browser.newContext({
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
      locale: this.config.locale,
      viewport: this.config.viewport,
      // Playwright records per context and only finalises the file on
      // context.close(), which is why `reset()` between scenarios is what makes
      // one video per scenario rather than one enormous file per run.
      ...(recordVideo ? { recordVideo } : {}),
    })
    await this.context.addInitScript((apiUrl) => {
      ;(window as typeof window & { __E2E_API_URL?: string }).__E2E_API_URL =
        apiUrl
    }, this.config.apiUrl)
    if (recordVideo) {
      await this.context.addInitScript(drawCursor)
    }
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

  /**
   * This window's recording, if it is being recorded.
   *
   * Must be read BEFORE the context closes — the handle is reachable through
   * the page, and the page is gone afterwards — even though the file itself
   * only exists once the context has closed.
   */
  video(): Video | undefined {
    return this.page?.video() ?? undefined
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

  /**
   * Photograph the page, on purpose, at a moment the author chose.
   *
   * Taken explicitly rather than automatically after every step: a run
   * captures dozens of steps and only a handful are worth looking at, and
   * "after each step" photographs the moment a step *finished* rather than the
   * moment that mattered. `description` is what you would tell a colleague to
   * look for — it becomes the filename and the caption.
   *
   * Writes into the run's capture directory when `--screenshots` is on, so
   * every image is stamped with the run and scenario that produced it. Without
   * the flag this still returns the bytes and writes nothing, so a scenario
   * that calls it is not broken by the flag being off.
   */
  async screenshot(
    description?: string,
    options?: ScenarioScreenshotOptions
  ): Promise<Uint8Array> {
    // Animations disabled so the same moment photographs the same way twice —
    // a shot that is published needs to be diffable across builds.
    const bytes = await this.page.screenshot({
      animations: 'disabled',
      ...(options?.fullPage ? { fullPage: true } : {}),
    })
    if (!this.capture?.screenshots || !description) {
      return bytes
    }

    const scenario = this.capture.scenario ?? 'scenario'
    const dir = join(this.capture.dir, this.capture.runId, slug(scenario))
    mkdirSync(dir, { recursive: true })

    // The index leads so a directory listing reads in the order the run
    // happened, which is the order somebody reviewing it wants.
    const index = String(++this.capture.taken).padStart(2, '0')
    const stem = `${slug(description)}-${slug(this.actor)}`
    const name = `${index}-${stem}.png`
    writeFileSync(join(dir, name), bytes)
    this.capture.filed.push({
      scenario,
      kind: 'screenshot',
      // Always forward slashes: this is a content key the console resolves
      // against a directory locally and a bucket when hosted.
      path: `${slug(scenario)}/${name}`,
      id: `${slug(scenario)}/${stem}`,
      actor: this.actor,
      name: description,
      ...(options?.showcase ? { showcase: true } : {}),
    })
    return bytes
  }

  /**
   * Photograph the page to a path the caller chose.
   *
   * Separate from `screenshot(description)` because the two have different
   * owners: a failure capture already knows where the file belongs and what to
   * call it, whereas a scenario author knows only what the moment *is* and
   * should not have to construct a path or remember that the extension decides
   * the encoder.
   */
  async writeScreenshot(file: string): Promise<Uint8Array> {
    mkdirSync(dirname(file), { recursive: true })
    // Playwright writes it: the caller owns the path, including the extension
    // that decides the encoder, so there is nothing for this to second-guess.
    return this.page.screenshot({ path: file })
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
