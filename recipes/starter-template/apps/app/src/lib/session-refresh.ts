import { apiUrl } from './env'

/**
 * Keeping the Better Auth cookie cache alive.
 *
 * The API authenticates from one cookie and nothing else. `betterAuthStatelessSession`
 * (see packages/functions/src/scaffold/auth/auth-middleware.gen.ts) verifies the signed
 * `session_data` blob with the secret alone — no database behind it — so when that cookie
 * ages out, every RPC answers 403 and the gate bounces the user to login. The longer-lived
 * `session_token` is still perfectly good at that point; nothing was reading it.
 *
 * Only Better Auth's own endpoints rewrite the cookie, and this app never calls them after
 * sign-in. So the app has to ask, and it has to ask in the one way that actually works:
 *
 *   `disableCookieCache=true` is NOT optional. Left off, /get-session sees a valid cache
 *   and hands it straight back without touching the cookie. The branch that would extend
 *   it in place is governed by `cookieRefreshCache`, which better-auth forces to `false`
 *   whenever a database is configured — as ours is — and warns if you ask for it. Setting
 *   the flag skips the cache, reads the session from the database, and writes a brand new
 *   cookie with a full maxAge on the way out.
 *
 * Reading the database is the point rather than a cost: it is where a ban or a revoked
 * session is recorded, so each refresh is also the moment those take effect. Between
 * refreshes the cookie is trusted on its own, which is what makes the middleware stateless.
 */

/*
 * The cadence deliberately does NOT track `SESSION_COOKIE_CACHE_MAX_AGE`. That value is an
 * operator's to set per stage (see packages/functions/src/lib/session-cookie.ts) and the
 * browser has no way to read it, so a constant here derived from it would be a copy that
 * silently goes stale. Instead the cadence is short enough to be safe under any lifetime
 * worth configuring, and one GET every ten minutes is nothing next to what an open app does
 * anyway.
 *
 * The contract it relies on: the cookie must outlive REFRESH_EVERY_MS. A stage that sets the
 * lifetime below ten minutes has to shorten this too — otherwise an RPC fired between
 * refreshes can 403, and only navigations get healed by the route gate.
 */

/** Well inside any sane cookie lifetime, and cheap enough to run all day. */
const REFRESH_EVERY_MS = 10 * 60 * 1000

/** A tab flicked away from and back to should not refresh on every glance. */
const REFRESH_AT_MOST_EVERY_MS = 2 * 60 * 1000

let lastRefreshAt = 0
let inFlight: Promise<boolean> | null = null

/**
 * Mint a fresh `session_data` cookie from the session in the database.
 *
 * Resolves true when a session came back, false when the user is genuinely signed out or
 * the request could not be made. It never throws: a refresh that fails changes nothing, and
 * the cookie already in the browser goes on working until it expires.
 */
export async function refreshSessionCookie(): Promise<boolean> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(`${apiUrl()}/auth/get-session?disableCookieCache=true`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) return false
      /* Signed out is `null`, not an error status — the body is the only tell. */
      const body = await res.json().catch(() => null)
      const ok = !!body && typeof body === 'object' && 'user' in body && !!body.user
      if (ok) lastRefreshAt = Date.now()
      return ok
    } catch {
      return false
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** As above, but a no-op if one already happened a moment ago. */
async function refreshIfStale(): Promise<void> {
  if (Date.now() - lastRefreshAt < REFRESH_AT_MOST_EVERY_MS) return
  await refreshSessionCookie()
}

let running = false
let timer: number | undefined
let onVisible: (() => void) | undefined

/**
 * Start re-upping the cookie: on a timer for a tab left open, and whenever the tab is looked
 * at again — the last of which is the one that matters on a phone, where the app is
 * backgrounded far more often than it is closed.
 *
 * Idempotent, and called from the route gate rather than mounted as a hook. The gate is the
 * one place every app has in the same shape, it runs before anything renders, and it only
 * runs for someone who is actually signed in — a shell component would have to be edited in
 * every app and would start the timer on whatever happened to be mounted.
 */
export function startSessionRefresh(): void {
  if (running || typeof window === 'undefined') return
  running = true

  timer = window.setInterval(() => {
    void refreshSessionCookie().then((ok) => {
      /* Signed out for good — stop asking rather than poll a dead session forever. */
      if (!ok && !document.hidden) stopSessionRefresh()
    })
  }, REFRESH_EVERY_MS)

  onVisible = () => {
    if (document.visibilityState === 'visible') void refreshIfStale()
  }
  document.addEventListener('visibilitychange', onVisible)
}

/** Stop the timer. The gate starts it again on the next signed-in navigation. */
export function stopSessionRefresh(): void {
  if (!running) return
  running = false
  if (timer !== undefined) window.clearInterval(timer)
  if (onVisible) document.removeEventListener('visibilitychange', onVisible)
  timer = undefined
  onVisible = undefined
}
