import { ActorSession, type PageIssues } from './actor-session.js'
import { connectOrLaunch, type BrowserConnection } from './browser-launch.js'
import { browserConfigFromEnv, type BrowserConfig } from './config.js'

/** One page photographed, or the reason it could not be. */
export interface PageScreenshot {
  path: string
  url: string
  png: Uint8Array | null
  httpStatus: number | null
  issues: PageIssues
  error?: string
}

export interface ScreenshotPagesOptions {
  /** Origin-relative paths to visit, already resolved (no `$param` segments). */
  paths: string[]
  /** An open session — signed in as an actor, or anonymous from {@link openPageSession}. */
  session: ActorSession
  /** Capture the whole scrollable page rather than the viewport. Defaults on. */
  fullPage?: boolean
}

/** Visit each path in turn and photograph it; one page failing never stops the rest. */
export async function screenshotPages({
  paths,
  session,
  fullPage = true,
}: ScreenshotPagesOptions): Promise<PageScreenshot[]> {
  const shots: PageScreenshot[] = []
  for (const path of paths) {
    session.resetIssues()
    const url = session.url(path)
    try {
      const httpStatus = await session.gotoApp(path)
      const png = await session.page.screenshot({
        fullPage,
        animations: 'disabled',
        style: '[data-pikku-cursor]{display:none!important}',
      })
      shots.push({ path, url, png, httpStatus, issues: session.takeIssues() })
    } catch (err) {
      shots.push({
        path,
        url,
        png: null,
        httpStatus: null,
        issues: session.takeIssues(),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return shots
}

/** A signed-out browser session against `appUrl`, with the browser it runs in; `close()` releases both. */
export async function openPageSession(
  appUrl: string,
  {
    config = browserConfigFromEnv({ appUrl }),
    connectBrowser = () => connectOrLaunch(config),
  }: {
    config?: BrowserConfig
    connectBrowser?: () => Promise<BrowserConnection>
  } = {}
): Promise<{ session: ActorSession; close: () => Promise<void> }> {
  const { browser, release } = await connectBrowser()
  const session = new ActorSession('anonymous', { ...config, appUrl })
  try {
    await session.open(browser)
  } catch (err) {
    await release?.()
    throw err
  }
  return {
    session,
    close: async () => {
      await session.close()
      await release?.()
    },
  }
}

/** A filename for a page's screenshot: `/` is `index`, every other `/` a `_`. */
export function screenshotName(path: string): string {
  const leaf = path.replace(/^\/+|\/+$/g, '').replace(/[^\w.-]+/g, '_')
  return `${leaf || 'index'}.png`
}
