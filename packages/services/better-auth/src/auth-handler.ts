import type { CorePikkuFunctionSessionless } from '@pikku/core/function'
import { toWebRequest } from '@pikku/core/http'
import type { BetterAuthInstance } from './define-auth.js'
import {
  handleDevQuickLogin,
  isDevQuickLoginRequest,
} from './dev-quick-login.js'
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

export const createAuthHandler = (): {
  func: CorePikkuFunctionSessionless<any, any>
} => ({
  func: async (services, _input, { http }) => {
    const request = http?.request
    if (!request) {
      return
    }
    const auth = (await (services as any).auth()) as BetterAuthInstance
    const webRequest = toWebRequest(request)
    // /get-session, sign-out and /update-user all read the session off Cookie.
    mergeRelayedCookies(webRequest.headers)
    const basePath = (auth as any).options?.basePath ?? '/api/auth'
    const response = isDevQuickLoginRequest(webRequest, basePath)
      ? await handleDevQuickLogin(
          auth,
          webRequest,
          (services as any).logger,
          (services as any).scopeService
        )
      : await auth.handler(webRequest)
    return crossSiteCookies() ? rewriteSetCookies(response) : response
  },
})
