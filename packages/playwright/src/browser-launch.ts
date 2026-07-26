import { chromium, type Browser } from '@playwright/test'
import type { BrowserConfig } from './config.js'

export interface BrowserConnection {
  browser: Browser
  release?: () => Promise<void>
}

/**
 * Connect to a remote CDP browser, or launch a local chromium. Remote wins when
 * configured, so a CPU/RAM-capped sandbox never runs a browser of its own.
 */
export async function connectOrLaunch(
  config: BrowserConfig
): Promise<BrowserConnection> {
  if (config.cdpUrl) {
    const ws = await resolveCdpWsUrl(config.cdpUrl)
    return { browser: await chromium.connectOverCDP(ws) }
  }
  const browser = await chromium.launch({
    headless: !config.headed,
    executablePath: config.chromiumPath,
    slowMo: config.slowMo,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // The frontend may be host-matched at the edge (Caddy), so the browser
      // must resolve the sandbox hostname to the loopback edge, not real DNS.
      ...(config.hostnameOnly
        ? [`--host-resolver-rules=MAP ${config.hostnameOnly} 127.0.0.1`]
        : []),
    ],
  })
  return { browser, release: () => browser.close() }
}

/**
 * Resolve a dialable ws:// endpoint for a remote CDP base URL. Passing the http
 * base straight to connectOverCDP makes Playwright fetch /json/version and trust
 * its `webSocketDebuggerUrl` — but proxies (e.g. Steel's nginx) echo the request
 * Host and DROP the port, yielding an undialable URL. Fetch it ourselves, then
 * force host:port back from the base URL.
 */
export async function resolveCdpWsUrl(cdpBaseUrl: string): Promise<string> {
  const res = await fetch(new URL('/json/version', cdpBaseUrl))
  if (!res.ok) {
    throw new Error(`[e2e] remote CDP /json/version returned ${res.status}`)
  }
  const { webSocketDebuggerUrl } = (await res.json()) as {
    webSocketDebuggerUrl?: string
  }
  if (!webSocketDebuggerUrl) {
    throw new Error(
      '[e2e] remote CDP /json/version had no webSocketDebuggerUrl'
    )
  }
  const base = new URL(cdpBaseUrl)
  const ws = new URL(webSocketDebuggerUrl)
  ws.protocol = 'ws:'
  ws.host = base.host
  return ws.toString()
}
