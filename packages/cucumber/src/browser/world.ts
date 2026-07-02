import { chromium, type Browser } from '@playwright/test'
import { ActorSession } from './actor-session.js'
import {
  browserConfigFromEnv,
  derivePersona,
  type BrowserConfig,
  type PersonaCredentials,
} from './config.js'

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
export class BrowserWorld {
  readonly config: BrowserConfig
  private browser?: Browser
  private actors = new Map<string, ActorSession>()
  private last?: ActorSession

  constructor(_cucumberOptions?: unknown, config?: BrowserConfig) {
    this.config = config ?? browserConfigFromEnv()
  }

  /**
   * Resolve an actor by name, creating it (own context/window/session) on
   * first mention. `undefined` (a `they` step) → the last-referenced actor,
   * or the default actor if none has been named yet.
   */
  async actor(name?: string): Promise<ActorSession> {
    if (name === undefined) {
      if (!this.last) return this.actor('the user')
      return this.last
    }
    let session = this.actors.get(name)
    if (!session) {
      session = new ActorSession(name, this.personaFor(name), this.config)
      await session.open(await this.launchBrowser())
      this.actors.set(name, session)
    }
    this.last = session
    return session
  }

  /** The current actor's page — for project-specific steps. */
  get page() {
    if (!this.last) {
      throw new Error('[e2e] no actor yet — start the scenario with a visit/sign-in step')
    }
    return this.last.page
  }

  /** All live actors (e.g. to dump debug state on failure). */
  allActors(): ActorSession[] {
    return [...this.actors.values()]
  }

  async closeAll() {
    for (const actor of this.actors.values()) {
      await actor.close()
    }
    this.actors.clear()
    this.last = undefined
    await this.browser?.close()
    this.browser = undefined
  }

  private personaFor(name: string): PersonaCredentials {
    if (name === 'the user') return this.config.defaultPersona
    return this.config.personas[name] ?? derivePersona(name, this.config.defaultPersona)
  }

  private async launchBrowser(): Promise<Browser> {
    if (this.browser) return this.browser
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
