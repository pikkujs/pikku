// Self-contained handle types so consumers can type against @pikku/browser
// WITHOUT installing puppeteer/playwright/stagehand — the real library handles
// structurally satisfy these at the impl boundary (which casts internally).

export interface PikkuPdfOptions {
  format?: string
  landscape?: boolean
  printBackground?: boolean
  scale?: number
  width?: string
  height?: string
  margin?: { top?: string; bottom?: string; left?: string; right?: string }
}

export type PikkuWaitUntil =
  | 'load'
  | 'domcontentloaded'
  | 'networkidle0'
  | 'networkidle2'

export interface PikkuNavigationOptions {
  waitUntil?: PikkuWaitUntil
  timeout?: number
}

export interface PikkuPage {
  goto(url: string, opts?: PikkuNavigationOptions): Promise<unknown>
  setContent(html: string, opts?: PikkuNavigationOptions): Promise<void>
  content(): Promise<string>
  pdf(opts?: PikkuPdfOptions): Promise<Uint8Array>
  screenshot(opts?: {
    fullPage?: boolean
    type?: 'png' | 'jpeg'
  }): Promise<Uint8Array>
  evaluate<T = unknown>(
    fn: string | ((...args: any[]) => T),
    ...args: any[]
  ): Promise<T>
  close(): Promise<void>
}

export interface PikkuBrowser {
  newPage(): Promise<PikkuPage>
  /** Disconnect the client but leave the (keep-alive) session running. */
  disconnect(): Promise<void>
  /** Close the browser and end the session. */
  close(): Promise<void>
}

export interface BrowserSession {
  sessionId: string
  browser: PikkuBrowser
}

export interface BrowserSessionInfo {
  sessionId: string
  startTime?: number
  /** Set when a client is currently attached (mirrors CF's connectionId). */
  connectionId?: string
}

export interface BrowserLaunchOptions {
  /** ms to keep the session alive after the last client disconnects. */
  keepAlive?: number
}

export interface BrowserLimits {
  activeSessions: number
  maxConcurrentSessions: number
  allowedBrowserAcquisitions?: number
}

export interface StagehandLaunchOptions {
  /** Overrides the default LiteLLM-routed model (e.g. 'openai/gpt-4o-mini'). */
  modelName?: string
  instructions?: string
}

export interface StagehandActResult {
  success: boolean
  message?: string
  action?: string
}

export interface PikkuStagehand {
  page: PikkuPage
  act(instruction: string): Promise<StagehandActResult>
  extract<T = unknown>(opts: { instruction: string; schema?: unknown }): Promise<T>
  observe(
    instruction?: string
  ): Promise<Array<{ selector: string; description: string }>>
  close(): Promise<void>
}

/**
 * Browser automation with a session API modeled on @cloudflare/puppeteer, so a
 * single consumer code path reuses warm browsers identically on Cloudflare
 * (session reuse via the platform) and locally (an in-process keep-alive pool).
 *
 * `launch/connect/sessions/limits` mirror the CF binding surface; `acquire` is
 * the ergonomic "reuse an idle session or launch a new one". `getStagehand`/
 * `getPlaywright` are optional richer clients over the same browser endpoint.
 */
export interface BrowserService {
  /** Reuse an idle session if one exists, otherwise launch a new one. */
  acquire(opts?: BrowserLaunchOptions): Promise<BrowserSession>
  launch(opts?: BrowserLaunchOptions): Promise<BrowserSession>
  connect(sessionId: string): Promise<BrowserSession>
  sessions(): Promise<BrowserSessionInfo[]>
  limits?(): Promise<BrowserLimits>
  getStagehand?(opts?: StagehandLaunchOptions): Promise<PikkuStagehand>
  getPlaywright?(opts?: BrowserLaunchOptions): Promise<PikkuBrowser>
}
