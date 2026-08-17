/**
 * Browser configuration for scenario steps. Sandbox-first: when
 * SANDBOX_HOSTNAME is set (the Fabric build sandbox), steps run against the
 * in-container HTTPS edge so the app's Secure session cookie carries in the
 * browser. Locally, falls back to a dev server. Everything is overridable per
 * environment via env vars.
 *
 * Unlike the cucumber harness this replaces, there are no personas here:
 * identity comes from the scenario's own actors, so a browser step and an HTTP
 * step run as the same user.
 */

import { loadElementMap, type ElementMap } from './elements.js'

export interface BrowserConfig {
  /** Base URL of the running frontend. */
  appUrl: string
  /**
   * Where `appUrl` came from. `default` means nothing named a target and the
   * local dev fallback was used — the scenario runner treats that as a
   * misconfiguration rather than silently testing localhost.
   */
  appUrlSource?: 'override' | 'env' | 'default'
  /**
   * Where each app is served, keyed by the `app` its personas declare. A
   * session navigates against its own actor's app; `appUrl` covers a persona
   * that names none.
   */
  appUrls?: Record<string, string>
  /** Base URL of the API (default: same origin under /api). */
  apiUrl: string
  /** Per-action Playwright timeout (ms). */
  timeout: number
  headed: boolean
  slowMo: number
  /** Browser locale (affects date/number formatting the app renders). */
  locale?: string
  /** Explicit chromium binary (e.g. the sandbox-image system chromium). */
  chromiumPath?: string
  /**
   * Remote CDP endpoint (e.g. a Steel browser). When set, connect over CDP to
   * this shared/remote browser instead of launching a local chromium — so a
   * CPU/RAM-capped sandbox never runs a browser. The remote browser reaches the
   * app at its PUBLIC edge, so `appUrl` must be publicly resolvable (no
   * hostnameOnly loopback mapping is applied on this path).
   */
  cdpUrl?: string
  /** Bare hostname mapped to 127.0.0.1 via a chromium host-resolver rule. */
  hostnameOnly?: string
  /** Accept self-signed edge certs (in-container Caddy CA). */
  ignoreHTTPSErrors: boolean
  /** Registered element map (name → selector, per kind), usually generated. */
  elements: ElementMap
  /** Directory steps resolve upload fixtures against. */
  fixturesDir: string
  /** Repo root, used to enumerate routes from generated route trees. */
  repoRoot: string
}

/** Resolve config from env with sandbox-aware defaults. */
export function browserConfigFromEnv(
  overrides: Partial<BrowserConfig> = {},
  env: Record<string, string | undefined> = process.env
): BrowserConfig {
  const host = env.SANDBOX_HOSTNAME
  const envAppUrl =
    env.E2E_APP_URL ?? env.APP_URL ?? (host ? `https://${host}` : undefined)
  const appUrl = overrides.appUrl ?? envAppUrl ?? 'http://localhost:5001'
  return {
    appUrl,
    appUrlSource: overrides.appUrl ? 'override' : envAppUrl ? 'env' : 'default',
    ...(overrides.appUrls ? { appUrls: overrides.appUrls } : {}),
    apiUrl:
      overrides.apiUrl ?? env.E2E_API_URL ?? env.API_URL ?? `${appUrl}/api`,
    timeout: overrides.timeout ?? Number(env.E2E_TIMEOUT ?? 30_000),
    headed: overrides.headed ?? (env.HEADED === '1' || env.HEADED === 'true'),
    slowMo: overrides.slowMo ?? (env.HEADED ? 120 : 0),
    locale: overrides.locale ?? env.E2E_LOCALE,
    chromiumPath:
      overrides.chromiumPath ?? (env.PLAYWRIGHT_CHROMIUM_PATH || undefined),
    cdpUrl: overrides.cdpUrl ?? (env.XBROWSER_CDP_URL || undefined),
    hostnameOnly:
      overrides.hostnameOnly ?? (host ? host.split(':')[0] : undefined),
    ignoreHTTPSErrors: overrides.ignoreHTTPSErrors ?? true,
    elements: overrides.elements ?? loadElementMap(env.E2E_ELEMENTS),
    fixturesDir:
      overrides.fixturesDir ?? env.E2E_FIXTURES_DIR ?? 'tests/fixtures',
    repoRoot: overrides.repoRoot ?? env.E2E_REPO_ROOT ?? '..',
  }
}
