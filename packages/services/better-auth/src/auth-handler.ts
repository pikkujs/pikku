import type { CorePikkuFunctionSessionless } from '@pikku/core/function'
import { toWebRequest } from '@pikku/core/http'
import type { BetterAuthInstance } from './define-auth.js'
import {
  CROSS_SITE_SET_COOKIE_HEADER,
  crossSiteCookies,
  encodeSetCookies,
  getSetCookies,
  mergeRelayedCookies,
  toCrossSite,
} from './cross-site-cookies.js'

/**
 * Rewrite every Set-Cookie on the auth handler's response for cross-site use,
 * and echo the rewritten cookies in a JS-readable header so a client whose
 * browser refuses third-party cookies outright (any WebKit one, i.e. every
 * browser on iOS) can relay them back itself — see cross-site-cookies.ts.
 *
 * Read the cookies via getSetCookie() (which keeps them split) BEFORE copying
 * the rest of the headers — copying a Headers merges duplicate Set-Cookie into a
 * single comma-joined value, so we delete and re-append the clean ones.
 */
const rewriteSetCookies = (response: Response): Response => {
  const cookies = getSetCookies(response.headers)
  if (cookies.length === 0) {
    return response
  }
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  const rewritten = cookies.map(toCrossSite)
  for (const cookie of rewritten) {
    headers.append('set-cookie', cookie)
  }
  headers.set(CROSS_SITE_SET_COOKIE_HEADER, encodeSetCookies(rewritten))
  // Caches special-case `Set-Cookie` and know nothing about the echo, so one
  // that would have refused this response will happily store it — and hand one
  // user's session to the next.
  headers.set('cache-control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * The function behind the generated `/api/auth/**` route. It forwards the
 * request to `services.auth().handler`, merging relayed cross-site cookies in
 * first, and rewrites the response's cookies for cross-site use under
 * `AUTH_COOKIE_CROSS_SITE`.
 *
 * Takes no arguments: the instance comes from `services.auth`, which the
 * generated services wrapper builds from the app's `pikkuBetterAuth` factory.
 *
 * @example snippet: betterAuthHandler
 */
export const createAuthHandler = (): {
  func: CorePikkuFunctionSessionless<any, any>
} => ({
  func: async (services, _input, { http }) => {
    const request = http?.request
    if (!request) {
      return
    }
    if (!services.auth) {
      throw new Error(
        'createAuthHandler: services.auth is missing — register the better-auth factory with pikkuBetterAuth'
      )
    }
    const auth: BetterAuthInstance = await services.auth()
    const webRequest = toWebRequest(request)
    // /get-session, sign-out and /update-user all read the session off Cookie.
    mergeRelayedCookies(webRequest.headers)
    const response = await auth.handler(webRequest)
    return crossSiteCookies() ? rewriteSetCookies(response) : response
  },
})
