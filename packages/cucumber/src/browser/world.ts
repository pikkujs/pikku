import { chromium, type Browser } from '@playwright/test'
import { ActorSession, type ClientContext } from './actor-session.js'
import {
  browserConfigFromEnv,
  derivePersona,
  type BrowserConfig,
  type PersonaCredentials,
} from './config.js'

let sharedRemoteBrowser: Promise<Browser> | undefined
let sharedRemoteRelease: (() => Promise<void>) | undefined

export interface BrowserConnection {
  browser: Browser
  release?: () => Promise<void>
}

export async function disposeSharedBrowser(): Promise<void> {
  const release = sharedRemoteRelease
  sharedRemoteRelease = undefined
  sharedRemoteBrowser = undefined
  if (release) await release()
}

/**
 * BrowserWorld — one scenario's browser plus its actors.
 *
 * Actors are personas driving the app in their OWN browser context (own
 * window, cookie jar, session): `Given "the admin" is signed in` creates the
 * actor on first mention; `they` in a later step refers to the last-referenced
 * actor (or a default actor, "the user", when no actor has been named yet).
 *
 * A plain class (not extending cucumber's World) so the package has no
 * dependency on @cucumber/cucumber — the consumer passes it to
 * setWorldConstructor and passes Given/When/Then into registerBrowserSteps.
 */
export class BrowserWorld<Clients = unknown> {
  readonly config: BrowserConfig
  private browser?: Browser
  private actors = new Map<string, ActorSession<Clients>>()
  private last?: ActorSession<Clients>

  constructor(_cucumberOptions?: unknown, config?: BrowserConfig) {
    this.config = config ?? browserConfigFromEnv()
  }

  /**
   * Resolve an actor by name, creating it (own context/window/session) on
   * first mention. `undefined` (a `they` step) → the last-referenced actor,
   * or the default actor if none has been named yet.
   */
  async actor(name?: string): Promise<ActorSession<Clients>> {
    if (name === undefined) {
      if (!this.last) return this.actor('the user')
      return this.last
    }
    let session = this.actors.get(name)
    if (!session) {
      session = new ActorSession<Clients>(
        name,
        this.personaFor(name),
        this.config,
        this.createClients ? (ctx) => this.createClients!(ctx) : undefined
      )
      await session.open(await this.launchBrowser())
      this.actors.set(name, session)
    }
    this.last = session
    return session
  }

  /**
   * Override to wire the app's GENERATED pikku clients (PikkuRPC/PikkuFetch)
   * for `actor.clients()` — instantiate them, setServerUrl(ctx.apiUrl), and
   * set the actor's session via setHeader('Cookie', ctx.cookieHeader).
   */
  protected createClients?(ctx: ClientContext): Clients

  protected connectBrowser?(): Promise<BrowserConnection>

  /**
   * Backs the "the app data is reset" step. Override to call the app's own
   * reset RPC through the generated typed client (preferred); the default
   * posts to the env-configured reset endpoint (E2E_RESET_URL).
   */
  async resetAppData(): Promise<void> {
    const { resetUrl, resetRpcName } = this.config
    if (!resetUrl) {
      throw new Error(
        '[e2e] "the app data is reset" needs E2E_RESET_URL, or override resetAppData() on your world to call the app\'s reset RPC via its typed client'
      )
    }
    const body = resetRpcName ? JSON.stringify({ rpcName: resetRpcName, data: {} }) : undefined
    const res = await fetch(resetUrl, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body,
    })
    if (!res.ok) throw new Error(`[e2e] reset hook ${resetUrl} returned ${res.status}`)
  }

  /** The current actor's page — for project-specific steps. */
  get page() {
    if (!this.last) {
      throw new Error('[e2e] no actor yet — start the scenario with a visit/sign-in step')
    }
    return this.last.page
  }

  /** All live actors (e.g. to dump debug state on failure). */
  allActors(): ActorSession<Clients>[] {
    return [...this.actors.values()]
  }

  async closeAll() {
    for (const actor of this.actors.values()) {
      await actor.close()
    }
    this.actors.clear()
    this.last = undefined
    if (!this.config.cdpUrl && !this.connectBrowser) {
      await this.browser?.close()
    }
    this.browser = undefined
  }

  private personaFor(name: string): PersonaCredentials {
    if (name === 'the user') return this.config.defaultPersona
    return this.config.personas[name] ?? derivePersona(name, this.config.defaultPersona)
  }

  private async launchBrowser(): Promise<Browser> {
    if (this.browser) return this.browser
    if (this.connectBrowser || this.config.cdpUrl) {
      if (!sharedRemoteBrowser) {
        const connect: Promise<BrowserConnection> = this.connectBrowser
          ? this.connectBrowser()
          : resolveCdpWsUrl(this.config.cdpUrl!).then(async (ws) => ({
              browser: await chromium.connectOverCDP(ws),
            }))
        sharedRemoteBrowser = connect.then(
          ({ browser, release }) => {
            sharedRemoteRelease = release
            browser.on('disconnected', () => {
              sharedRemoteBrowser = undefined
              sharedRemoteRelease = undefined
            })
            return browser
          },
          (err) => {
            // Clear the cached rejection so the next scenario retries the connect.
            sharedRemoteBrowser = undefined
            sharedRemoteRelease = undefined
            throw err
          }
        )
      }
      this.browser = await sharedRemoteBrowser
      return this.browser
    }
    this.browser = await chromium.launch({
      headless: !this.config.headed,
      executablePath: this.config.chromiumPath,
      slowMo: this.config.slowMo,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // The frontend may be host-matched at the edge (Caddy), so the browser
        // must resolve the sandbox hostname to the loopback edge, not real DNS.
        ...(this.config.hostnameOnly
          ? [`--host-resolver-rules=MAP ${this.config.hostnameOnly} 127.0.0.1`]
          : []),
      ],
    })
    return this.browser
  }
}

/**
 * Resolve a dialable ws:// endpoint for a remote CDP base URL. Passing the http
 * base straight to connectOverCDP makes Playwright fetch /json/version and trust
 * its `webSocketDebuggerUrl` — but proxies (e.g. Steel's nginx) echo the request
 * Host and DROP the port, yielding an undialable URL. Fetch it ourselves, then
 * force host:port back from the base URL.
 */
async function resolveCdpWsUrl(cdpBaseUrl: string): Promise<string> {
  const res = await fetch(new URL('/json/version', cdpBaseUrl))
  if (!res.ok) throw new Error(`[e2e] remote CDP /json/version returned ${res.status}`)
  const { webSocketDebuggerUrl } = (await res.json()) as { webSocketDebuggerUrl?: string }
  if (!webSocketDebuggerUrl) {
    throw new Error('[e2e] remote CDP /json/version had no webSocketDebuggerUrl')
  }
  const base = new URL(cdpBaseUrl)
  const ws = new URL(webSocketDebuggerUrl)
  ws.protocol = 'ws:'
  ws.host = base.host
  return ws.toString()
}
