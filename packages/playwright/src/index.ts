/**
 * Playwright driver for pikku scenario steps.
 *
 * A step declared with `browser: true` is handed a browser session on
 * `wire.browser`; this package provides that session, one isolated context per
 * actor, signed in as that actor.
 */
import type { Page, BrowserContext, Locator } from '@playwright/test'
import type { TestIdSelector } from '@pikku/core/workflow'
import type { LocateTestIdOptions } from './testid.js'

declare module '@pikku/core/workflow' {
  interface PikkuBrowserWire {
    /** The actor's page — the full Playwright API, not a wrapper. */
    page: Page
    /** The actor's isolated context (cookie jar, storage). */
    context: BrowserContext
    /**
     * Resolve an element by its test id, with the app-agnostic vocabulary in
     * `TestIdSelector` — data attributes, id prefixes, text, and scoping.
     * Returns every match; narrow with `.first()` to act on one.
     */
    locate(selector: TestIdSelector, options?: LocateTestIdOptions): Locator
  }
}

/**
 * Playwright's own web-first assertions, re-exported so a step asserts through
 * a retrying matcher instead of sampling a locator once and hand-rolling the
 * wait. `@playwright/test` is this package's peer dependency, so a consumer
 * reaches it here rather than depending on the test runner directly.
 */
export { expect } from '@playwright/test'

export { browserConfigFromEnv, type BrowserConfig } from './config.js'
export {
  loadElementMap,
  registered,
  type ElementKind,
  type ElementMap,
} from './elements.js'
export { ActorSession, type PageIssues } from './actor-session.js'
export {
  connectOrLaunch,
  resolveCdpWsUrl,
  type BrowserConnection,
} from './browser-launch.js'
export {
  PlaywrightScenarioBrowserProvider,
  type ActorSignIn,
  type ActorSignInRequest,
  type ActorSignInTarget,
  type PlaywrightScenarioBrowserProviderOptions,
} from './provider.js'
export { staticRoutes, sweepAllPages } from './pages-sweep.js'
export {
  locateTestId,
  testIdSelector,
  type LocateTestIdOptions,
} from './testid.js'
export * as mantine from './locators.js'
