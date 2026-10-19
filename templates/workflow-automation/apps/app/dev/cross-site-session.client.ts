import { apiUrl } from '@/lib/env'

// Session relay for the Fabric console's preview iframe. Injected into the
// client module graph by cross-site-session.plugin.ts on `vite dev` ONLY —
// nothing here is reachable from app source, so `vite build` never sees it.
//
// The console embeds this app cross-site (console on one domain, the sandbox on
// another), which makes the Better Auth session cookie a third-party cookie.
// The sandbox already rewrites it to `SameSite=None; Secure; Partitioned`, which
// is enough for Chromium — but WebKit ignores `Partitioned` and blocks
// third-party cookie writes outright, and every browser on iOS is WebKit. So on
// a phone, sign-in returns 200, the cookie is discarded, the next request is
// anonymous, and the app bounces back to /app/login.
//
// WebKit does allow partitioned localStorage in a third-party frame, so the
// cookies live there instead: the server echoes what it just set in
// `x-pikku-cross-site-set-cookie` (JS can never read Set-Cookie itself) and we
// send them back on every API call in `x-pikku-cross-site-cookie`, which the
// pikku session middleware merges into the Cookie header. Keep both names in
// sync with @pikku/better-auth's cross-site-cookies.ts.
//
// Dev-only by construction, and that matters: a session token belongs in an
// HttpOnly cookie, not in storage every script on the page can read. The jar
// also stays empty unless the server opts in (AUTH_COOKIE_CROSS_SITE, which only
// the sandbox sets), so a plain `vite dev` outside a sandbox relays nothing.
const RELAY_HEADER = 'x-pikku-cross-site-cookie'
const ECHO_HEADER = 'x-pikku-cross-site-set-cookie'
const STORAGE_KEY = 'pikku.cross-site-session'

/** Cookie value plus its own expiry, so the jar can drop it the way a cookie store would. */
type Entry = { v: string; e?: number }
type Jar = Record<string, Entry>

// Storage can throw (Safari private browsing, a partition denied storage), and
// an in-memory jar still carries a session for the life of the tab.
let memoryJar: Jar = {}

/** Tolerates a jar written by an older shape; anything unreadable is dropped. */
function parseJar(raw: string): Jar {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const jar: Jar = {}
  for (const [name, value] of Object.entries(parsed ?? {})) {
    if (typeof value === 'string') jar[name] = { v: value }
    else if (value && typeof (value as Entry).v === 'string') jar[name] = value as Entry
  }
  return jar
}

function readJar(): Jar {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) memoryJar = parseJar(raw)
  } catch {
    // Keep whatever is in memory.
  }
  // A cookie store forgets an expired cookie on its own; this one has to be
  // told to. The server rejects a stale token anyway — this is so it stops
  // being sent, and stops sitting in storage, the moment it dies.
  const now = Date.now()
  const live = Object.entries(memoryJar).filter(([, e]) => e.e === undefined || e.e > now)
  if (live.length !== Object.keys(memoryJar).length) {
    writeJar(Object.fromEntries(live))
  }
  return memoryJar
}

function writeJar(jar: Jar): void {
  memoryJar = jar
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jar))
  } catch {
    // Memory-only for this tab.
  }
}

// A Set-Cookie whose Max-Age is zero/negative or whose Expires has passed is a
// deletion — sign-out sends exactly that, and a jar that ignored it would keep
// signing the user back in.
function expiresAt(attributes: string[]): number | null {
  for (const attribute of attributes) {
    const [rawName, ...rest] = attribute.split('=')
    const name = rawName?.trim().toLowerCase()
    const value = rest.join('=').trim()
    if (name === 'max-age') {
      const seconds = Number(value)
      return Number.isNaN(seconds) ? null : Date.now() + seconds * 1000
    }
    if (name === 'expires') {
      const at = Date.parse(value)
      return Number.isNaN(at) ? null : at
    }
  }
  return null
}

function applySetCookies(setCookies: string[]): void {
  const jar = { ...readJar() }
  let changed = false
  for (const cookie of setCookies) {
    const [pair, ...attributes] = cookie.split(';')
    const eq = pair?.indexOf('=') ?? -1
    if (!pair || eq < 1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    const expiry = expiresAt(attributes)
    if (expiry !== null && expiry <= Date.now()) {
      if (name in jar) {
        delete jar[name]
        changed = true
      }
    } else if (jar[name]?.v !== value || jar[name]?.e !== (expiry ?? undefined)) {
      jar[name] = expiry === null ? { v: value } : { v: value, e: expiry }
      changed = true
    }
  }
  if (changed) writeJar(jar)
}

function serializeJar(): string {
  return Object.entries(readJar())
    .map(([name, entry]) => `${name}=${entry.v}`)
    .join('; ')
}

/**
 * Patch `fetch` so every API call carries the relayed cookies and picks up any
 * the server sets. Patching the global rather than each caller is deliberate:
 * Better Auth's client, the pikku SDK and the raw `fetch` in signInAsActor all
 * have to agree on the session, and only one of them is ours to change.
 */
export function installCrossSiteSession(): void {
  if (typeof window === 'undefined') return
  const current = window.fetch as typeof fetch & { __pikkuCrossSite?: true }
  if (current.__pikkuCrossSite) return

  let apiOrigin: string
  try {
    apiOrigin = new URL(apiUrl(), window.location.origin).origin
  } catch {
    return
  }

  const original = window.fetch.bind(window)
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let target: string | null = null
    try {
      const url = input instanceof Request ? input.url : String(input)
      target = new URL(url, window.location.origin).origin
    } catch {
      target = null
    }
    // Never leaves the API's own origin: the relay header carries the session
    // itself, so no third party may see it.
    if (target !== apiOrigin) return original(input as RequestInfo, init)

    const cookies = serializeJar()
    let response: Response
    if (cookies) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      )
      headers.set(RELAY_HEADER, cookies)
      response = await original(input as RequestInfo, { ...init, headers })
    } else {
      response = await original(input as RequestInfo, init)
    }

    const echoed = response.headers.get(ECHO_HEADER)
    if (echoed) {
      try {
        const parsed = JSON.parse(decodeURIComponent(echoed))
        if (Array.isArray(parsed)) applySetCookies(parsed)
      } catch {
        // A malformed echo is not worth breaking the response over.
      }
    }
    return response
  }) as typeof fetch & { __pikkuCrossSite?: true }

  wrapped.__pikkuCrossSite = true
  window.fetch = wrapped
}

installCrossSiteSession()
