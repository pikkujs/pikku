import type { Browser, Page } from 'puppeteer'

// The browser/page handles are puppeteer's own types — `@cloudflare/puppeteer`
// is an API-compatible fork pinned to the same core version, so one set of types
// describes both the local and the Cloudflare-backed implementation.
export type { Browser, Page }

export interface BrowserSession {
  sessionId: string
  browser: Browser
  /** Return the session to the pool, kept warm for reuse (CF: `disconnect`). */
  release(): Promise<void>
}

export interface BrowserSessionInfo {
  sessionId: string
  startTime?: number
  /** Set when a client is currently attached (mirrors CF's connectionId). */
  connectionId?: string
}

export interface BrowserLaunchOptions {
  /** ms to keep the session alive after the last client releases it. */
  keepAlive?: number
}

export interface BrowserLimits {
  activeSessions: number
  maxConcurrentSessions: number
  allowedBrowserAcquisitions?: number
}

/**
 * Browser automation with a session API modeled on @cloudflare/puppeteer, so a
 * single consumer code path reuses warm browsers identically on Cloudflare
 * (session reuse via the platform) and locally (an in-process keep-alive pool).
 *
 * `launch/connect/sessions/limits` mirror the CF binding surface; `acquire` is
 * the ergonomic "reuse an idle session or launch a new one".
 */
export interface BrowserService {
  /** Reuse an idle session if one exists, otherwise launch a new one. */
  acquire(opts?: BrowserLaunchOptions): Promise<BrowserSession>
  launch(opts?: BrowserLaunchOptions): Promise<BrowserSession>
  connect(sessionId: string): Promise<BrowserSession>
  sessions(): Promise<BrowserSessionInfo[]>
  limits?(): Promise<BrowserLimits>
}
