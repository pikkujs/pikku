// `pikkuMiddleware` comes from '#pikku', not '@pikku/core': the generated helper
// is already bound to this app's SingletonServices, while the core one is typed
// against CoreSingletonServices and will not accept a handler that reads app
// services.
import { pikkuMiddleware } from '#pikku/middleware'
import { InvalidOriginError } from '#pikku/error'
import { allowedOrigins } from '../lib/cors-origins.js'

/**
 * Normalise a URL to its origin — scheme + host + port, nothing else.
 * Returns null for anything unparseable, including the literal `"null"` origin
 * a sandboxed iframe or a `file://` page sends.
 */
export function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!url.protocol || !url.host) return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Decide whether a request origin may post analytics.
 *
 * The comparison is **exact**, on the parsed origin. Never substring or suffix
 * matching: `https://evil-myapp.com` ends with nothing useful, but a naive
 * `endsWith('myapp.com')` accepts `https://evil-myapp.com` and
 * `https://myapp.com.evil.net`, which is the classic way this check gets
 * silently defeated.
 *
 * Exported for direct unit testing — it is pure string comparison and should
 * not need a deployed stage to be covered.
 */
export function isAllowedAnalyticsOrigin(
  requestOrigin: string | null,
  hostOrigin: string | null,
  configuredOrigins: string[]
): boolean {
  if (!requestOrigin) return false
  if (hostOrigin && requestOrigin === hostOrigin) return true
  return configuredOrigins.some(
    (allowed) => toOrigin(allowed) === requestOrigin
  )
}

/**
 * Server-side origin lock for the unauthed `/analytics` ingest.
 *
 * This is NOT what `cors()` does. `cors()` sets response headers and is enforced
 * by the browser — a non-browser client ignores them entirely and the request
 * still runs. This rejects, with a 403, before the function body.
 *
 * What it buys is precise: it stops another site's page from beaconing into this
 * app's endpoint, which is the cheap and likely abuse. `Origin` is set by the
 * browser and trusted by nobody else, so a determined flood is not addressed
 * here at all — that is a rate limit's job, and there isn't one yet.
 *
 * A **missing** `Origin` is rejected too: a real browser beacon always sets one
 * on a cross-origin-capable POST, so its absence means a non-browser caller.
 *
 * Left at the default priority so it runs *inside* the global CORS middleware,
 * which means the 403 still carries CORS headers rather than surfacing in the
 * browser as an opaque network error.
 */
export const analyticsOriginMiddleware = pikkuMiddleware({
  name: 'analyticsOrigin',
  description: 'Rejects analytics beacons that did not come from this app.',
  func: async ({ variables }, { http }, next) => {
    const request = http?.request
    // No HTTP wire at all (an RPC or a test harness) — nothing to check.
    if (!request) return next()

    const requestOrigin =
      toOrigin(request.header('origin')) ??
      // Some beacon paths send only `Referer`. It is a full URL, so take its origin.
      toOrigin(request.header('referer'))

    // The app and its API share an origin in a deployed stage, so the request's
    // own Host is the allowlist in the common case and needs no configuration.
    //
    // The scheme cannot be assumed. Behind a proxy `x-forwarded-proto` states
    // it; with no proxy there is nothing to state it, and defaulting to `https`
    // compared `https://localhost:5173` against an `http://localhost:5173`
    // beacon and rejected every single one in local dev. So when the header is
    // absent the scheme is genuinely unknown and both are accepted — which
    // concedes nothing, because an attacker who controls the scheme of their own
    // page could send either anyway. The host and port still have to match
    // exactly, and that is the part doing the work.
    const hostHeader = request.header('host')
    const forwardedProto = request.header('x-forwarded-proto')
    const hostOrigins = hostHeader
      ? (forwardedProto ? [forwardedProto] : ['https', 'http']).map((proto) =>
          toOrigin(`${proto}://${hostHeader}`)
        )
      : [null]

    const configured = await allowedOrigins(variables)
    const allowed = hostOrigins.some((hostOrigin) =>
      isAllowedAnalyticsOrigin(requestOrigin, hostOrigin, configured)
    )
    if (!allowed) {
      throw new InvalidOriginError(
        `Analytics ingest rejected origin ${requestOrigin ?? '(none)'}`
      )
    }

    await next()
  },
})
