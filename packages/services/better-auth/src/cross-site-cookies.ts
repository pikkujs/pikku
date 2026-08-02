/**
 * Cross-site session support for apps rendered inside a third-party iframe
 * (the Fabric sandbox preview: the console is the top-level site, the app is
 * another one).
 *
 * A SameSite=Lax cookie is dropped outright in that context, so
 * AUTH_COOKIE_CROSS_SITE rewrites every better-auth cookie to
 * `SameSite=None; Secure; Partitioned`. That is enough for Chromium — but
 * `Partitioned` (CHIPS) is a Chromium feature: WebKit does not implement it and
 * blocks third-party cookie writes outright, and every browser on iOS is
 * WebKit. Sign-in returns 200, the cookie is discarded, the next request is
 * anonymous, and the app bounces back to /login.
 *
 * So the same flag also enables a cookie RELAY. The auth handler echoes the
 * cookies it just set in a readable response header (JS can never read
 * `Set-Cookie`, even same-origin); the embedded client keeps them in
 * partitioned `localStorage` — which WebKit does allow in a third-party frame —
 * and sends them back on every request in {@link CROSS_SITE_COOKIE_HEADER},
 * which the session middlewares merge back into `Cookie` before reading it.
 *
 * The relay is strictly opt-in per runtime: only an embedding host (the
 * sandbox) sets AUTH_COOKIE_CROSS_SITE. A deployed app both keeps the tighter
 * Lax cookies AND ignores the relay header, so a session token can never be
 * carried in JS-readable storage outside the preview.
 *
 * Why not better-auth's `bearer()` plugin, which is this same echo-and-relay
 * shape and signature-verifies on the way in: it carries only `session_token`,
 * and `betterAuthStatelessSession` reads `session_data` — the signed blob that
 * lets it resolve a session without bundling the better-auth server. Bearer
 * would force those apps onto `betterAuthSession`, which is the bundle weight
 * serverless targets cannot take. Relaying the whole jar is what keeps preview
 * and production on the same middleware.
 */

/** Request header carrying the relayed `name=value; name=value` cookie pairs. */
export const CROSS_SITE_COOKIE_HEADER = 'x-pikku-cross-site-cookie'

/**
 * Response header echoing the `Set-Cookie` values of a response, as a
 * percent-encoded JSON array. Encoded rather than sent raw because a Set-Cookie
 * string contains commas (`Expires=Wed, 09 Jun 2021 ...`), so no plain-text
 * separator is safe — and because a header value must be ASCII with no control
 * characters, which `encodeURIComponent` guarantees.
 */
export const CROSS_SITE_SET_COOKIE_HEADER = 'x-pikku-cross-site-set-cookie'

/** True when this runtime embeds its apps in a cross-site iframe. */
export const crossSiteCookies = (): boolean => {
  if (typeof process === 'undefined') return false
  const v = process.env?.AUTH_COOKIE_CROSS_SITE
  return v === 'true' || v === '1'
}

/** Rewrite one Set-Cookie for a third-party context. */
export const toCrossSite = (cookie: string): string => {
  let c = cookie.replace(/;\s*SameSite=(Lax|Strict|None)/gi, '')
  c += '; SameSite=None'
  if (!/;\s*Secure\b/i.test(c)) c += '; Secure'
  if (!/;\s*Partitioned\b/i.test(c)) c += '; Partitioned'
  return c
}

/** Read a response's Set-Cookie values without merging them into one string. */
export const getSetCookies = (headers: Headers): string[] =>
  typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : ([headers.get('set-cookie')].filter(Boolean) as string[])

export const encodeSetCookies = (cookies: string[]): string =>
  encodeURIComponent(JSON.stringify(cookies))

/**
 * Never throws — the client half runs this on whatever a response carried, and
 * a mangled header must degrade to "no cookies" rather than break its fetch.
 */
export const decodeSetCookies = (encoded: string): string[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(encoded))
  } catch {
    return []
  }
  return Array.isArray(parsed)
    ? parsed.filter((c) => typeof c === 'string')
    : []
}

const cookieNames = (cookieHeader: string): Set<string> => {
  const names = new Set<string>()
  for (const pair of cookieHeader.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) names.add(name)
  }
  return names
}

/**
 * Merge the relayed cookies into the request's own `Cookie` header. Real
 * cookies win: a browser that did store them (Chromium) is authoritative, and
 * the relayed copy may be a stale duplicate. Mutates and returns `headers`.
 *
 * A no-op unless {@link crossSiteCookies} — the header is untrusted input, and
 * outside an embedding runtime it must never be able to stand in for a cookie.
 */
export const mergeRelayedCookies = (headers: Headers): Headers => {
  if (!crossSiteCookies()) return headers
  const relayed = headers.get(CROSS_SITE_COOKIE_HEADER)
  if (!relayed) return headers
  const existing = headers.get('cookie') ?? ''
  // Grows as pairs are accepted, so a name repeated inside the relay header
  // itself resolves first-wins instead of reaching a parser twice.
  const taken = cookieNames(existing)
  const added: string[] = []
  for (const pair of relayed.split(';').map((p) => p.trim())) {
    const name = pair.split('=')[0]?.trim()
    if (!name || !pair.includes('=') || taken.has(name)) continue
    taken.add(name)
    added.push(pair)
  }
  if (added.length === 0) return headers
  headers.set('cookie', [existing, ...added].filter(Boolean).join('; '))
  return headers
}
