/**
 * Keeping the Better Auth session cookie alive from the browser.
 *
 * Under `betterAuthStatelessSession` the API authenticates from one signed cookie
 * and nothing else: it verifies `session_data` with the secret and never reaches
 * the database. When that cookie ages out every call 403s and the app's gate
 * bounces the user to login — while their `session_token` is still perfectly
 * good. Nothing was reading it.
 *
 * Only Better Auth's own endpoints rewrite the cookie, and a pikku app talks to
 * its RPCs and never calls `/api/auth/*` again after sign-in. So the app has to
 * ask, and it has to ask in the one way that actually works:
 *
 *   `disableCookieCache=true` is NOT optional. Left off, `/get-session` sees a
 *   valid cache and hands it straight back without touching the cookie. The
 *   branch that would extend it in place is governed by `cookieRefreshCache`,
 *   which better-auth forces to `false` whenever a database is configured — as
 *   it is in any app with users — and warns if you ask for it. Setting the flag
 *   skips the cache, reads the session from the database, and writes a brand new
 *   cookie with a full `Max-Age` on the way out.
 *
 * Reading the database is the point rather than a cost: it is where a ban or a
 * revoked session is recorded, so each refresh is also the moment those take
 * effect. Between refreshes the cookie is trusted on its own, which is exactly
 * what makes the middleware stateless.
 *
 * The cadence deliberately does NOT track the server's configured lifetime
 * (`SESSION_COOKIE_CACHE_MAX_AGE`). The browser has no way to read that value, so
 * a constant here derived from it would be a copy that silently goes stale.
 * Instead it is short enough to be safe under any lifetime worth configuring,
 * and one GET every ten minutes is nothing next to what an open app does anyway.
 *
 * The contract it relies on: the cookie must outlive `everyMs`. A stage that
 * sets the lifetime below ten minutes has to shorten this to match, or a call
 * fired between refreshes can still 403.
 */

export interface SessionRefreshOptions {
  /** Origin the API is served from, e.g. `https://example.com/api`. */
  apiUrl: string
  /** How often to re-mint while the tab is open. Default ten minutes. */
  everyMs?: number
  /** Floor between refreshes, so flicking back to a tab is not a request. Default two minutes. */
  atMostEveryMs?: number
  /**
   * Called when a refresh comes back signed out while the tab is visible — the
   * session is genuinely gone rather than merely stale. The refresh loop stops
   * itself first, so this will not be called repeatedly.
   */
  onSignedOut?: () => void
}

/** Well inside any sane cookie lifetime, and cheap enough to run all day. */
const DEFAULT_EVERY_MS = 10 * 60 * 1000

/** A tab flicked away from and back to should not refresh on every glance. */
const DEFAULT_AT_MOST_EVERY_MS = 2 * 60 * 1000

let lastRefreshAt = 0
let inFlight: Promise<boolean> | null = null

/**
 * Mint a fresh session cookie from the session in the database.
 *
 * Resolves true when a session came back, false when the user is genuinely
 * signed out or the request could not be made. It never throws: a refresh that
 * fails changes nothing, and the cookie already in the browser goes on working
 * until it expires.
 *
 * Concurrent calls share one request — the route gate and the timer can easily
 * fire together on a tab that has just been woken.
 */
export const refreshSessionCookie = async (
  apiUrl: string
): Promise<boolean> => {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch(
        `${apiUrl}/auth/get-session?disableCookieCache=true`,
        { credentials: 'include', headers: { accept: 'application/json' } }
      )
      if (!response.ok) return false
      /* Signed out is `null` with a 200, not an error status — the body is the
         only tell. */
      const body = await response.json().catch(() => null)
      const signedIn =
        !!body && typeof body === 'object' && !!(body as any).user
      if (signedIn) lastRefreshAt = Date.now()
      return signedIn
    } catch {
      return false
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

let running = false
let timer: ReturnType<typeof setInterval> | undefined
let onVisibilityChange: (() => void) | undefined

/**
 * Start re-upping the cookie: on a timer for a tab left open, and whenever the
 * tab is looked at again — the latter being the one that matters on a phone,
 * where an app is backgrounded far more often than it is closed.
 *
 * Idempotent, and meant to be called from the app's route gate rather than
 * mounted as a hook. The gate is the one place every app has in the same shape,
 * it runs before anything renders, and it only runs for someone who is actually
 * signed in — a component would start the timer on whatever happened to mount.
 */
export const startSessionRefresh = (options: SessionRefreshOptions): void => {
  if (running || typeof window === 'undefined') return
  running = true

  const {
    apiUrl,
    everyMs = DEFAULT_EVERY_MS,
    atMostEveryMs = DEFAULT_AT_MOST_EVERY_MS,
    onSignedOut,
  } = options

  timer = setInterval(() => {
    void refreshSessionCookie(apiUrl).then((signedIn) => {
      /* Signed out for good — stop rather than poll a dead session forever.
         Only while visible: a background tab that failed to reach the network
         should not be mistaken for a sign-out. */
      if (!signedIn && !document.hidden) {
        stopSessionRefresh()
        onSignedOut?.()
      }
    })
  }, everyMs)

  onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastRefreshAt < atMostEveryMs) return
    void refreshSessionCookie(apiUrl)
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/** Stop the timer. The gate starts it again on the next signed-in navigation. */
export const stopSessionRefresh = (): void => {
  if (!running) return
  running = false
  if (timer !== undefined) clearInterval(timer)
  if (onVisibilityChange) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  timer = undefined
  onVisibilityChange = undefined
}

/** @internal Test seam — forgets the throttle and any running loop. */
export const resetSessionRefresh = (): void => {
  stopSessionRefresh()
  lastRefreshAt = 0
  inFlight = null
}
