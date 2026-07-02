/**
 * Browser e2e configuration. Sandbox-first: when SANDBOX_HOSTNAME is set (the
 * Fabric build sandbox), tests run against the in-container HTTPS edge so the
 * app's Secure session cookie carries in the browser. Locally, falls back to a
 * dev server. Everything is overridable per environment via env vars.
 */

import { loadElementMap, type ElementMap } from './elements.js'

export interface PersonaCredentials {
  email: string
  password: string
  name?: string
}

export interface BrowserConfig {
  /** Base URL of the running frontend. */
  appUrl: string
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
  /** Bare hostname mapped to 127.0.0.1 via a chromium host-resolver rule. */
  hostnameOnly?: string
  /** Accept self-signed edge certs (in-container Caddy CA). */
  ignoreHTTPSErrors: boolean
  /** Credentials used for an unnamed/default actor. */
  defaultPersona: PersonaCredentials
  /** Named personas ("the admin" → credentials). Unknown names are derived. */
  personas: Record<string, PersonaCredentials>
  /** POST here before each scenario to reset app data to seed state. */
  resetUrl?: string
  /** RPC name posted to resetUrl as {rpcName, data:{}} (pikku /rpc envelope). */
  resetRpcName?: string
  /** Registered element map (name → selector, per kind), usually generated. */
  elements: ElementMap
  /** Directory feature files resolve upload fixtures against. */
  fixturesDir: string
  /** Repo root, used to enumerate routes from generated route trees. */
  repoRoot: string
}

/** Resolve config from env with sandbox-aware defaults. */
export function browserConfigFromEnv(
  overrides: Partial<BrowserConfig> = {}
): BrowserConfig {
  const env = process.env
  const host = env.SANDBOX_HOSTNAME
  const appUrl =
    overrides.appUrl ??
    env.E2E_APP_URL ??
    env.APP_URL ??
    (host ? `https://${host}` : 'http://localhost:5001')
  const defaultPersona: PersonaCredentials = {
    email: env.E2E_EMAIL ?? 'e2e@fabric.test',
    password: env.E2E_PASSWORD ?? 'Passw0rd!E2E',
    name: env.E2E_NAME ?? 'Fabric E2E',
  }
  return {
    appUrl,
    apiUrl: overrides.apiUrl ?? env.E2E_API_URL ?? env.API_URL ?? `${appUrl}/api`,
    timeout: overrides.timeout ?? Number(env.E2E_TIMEOUT ?? 30_000),
    headed: overrides.headed ?? (env.HEADED === '1' || env.HEADED === 'true'),
    slowMo: overrides.slowMo ?? (env.HEADED ? 120 : 0),
    locale: overrides.locale ?? env.E2E_LOCALE,
    chromiumPath: overrides.chromiumPath ?? (env.PLAYWRIGHT_CHROMIUM_PATH || undefined),
    hostnameOnly: overrides.hostnameOnly ?? (host ? host.split(':')[0] : undefined),
    ignoreHTTPSErrors: overrides.ignoreHTTPSErrors ?? true,
    defaultPersona: overrides.defaultPersona ?? defaultPersona,
    personas: overrides.personas ?? parsePersonas(env.E2E_PERSONAS),
    elements: overrides.elements ?? loadElementMap(env.E2E_ELEMENTS),
    resetUrl: overrides.resetUrl ?? env.E2E_RESET_URL,
    resetRpcName: overrides.resetRpcName ?? env.E2E_RESET_RPC_NAME,
    fixturesDir: overrides.fixturesDir ?? env.E2E_FIXTURES_DIR ?? 'tests/fixtures',
    repoRoot: overrides.repoRoot ?? env.E2E_REPO_ROOT ?? '..',
  }
}

function parsePersonas(raw: string | undefined): Record<string, PersonaCredentials> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, PersonaCredentials>
  } catch (err) {
    throw new Error(
      `[e2e] E2E_PERSONAS is not valid JSON ({"the admin":{"email":..,"password":..}}): ${(err as Error).message}`
    )
  }
}

/**
 * Derive stable credentials for a persona that isn't in the personas map, so
 * features can introduce actors ("a member", "the manager") with zero config.
 * Same actor name → same account, on any app.
 */
export function derivePersona(
  name: string,
  base: PersonaCredentials
): PersonaCredentials {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const [, domain = 'fabric.test'] = base.email.split('@')
  return {
    email: `e2e-${slug}@${domain}`,
    password: base.password,
    name: name.replace(/^(the|a|an)\s+/i, '').replace(/^./, (c) => c.toUpperCase()),
  }
}
