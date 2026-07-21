import type { CorePikkuFunctionSessionless } from '@pikku/core/function'
import { toWebRequest } from '@pikku/core/http'
import type { BetterAuthInstance } from './define-auth.js'
import {
  handleDevQuickLogin,
  isDevQuickLoginRequest,
} from './dev-quick-login.js'

/**
 * When the app runs embedded in a cross-site iframe (e.g. the Fabric sandbox
 * preview, where the top-level page and the app are different sites) a
 * SameSite=Lax session cookie is silently dropped by the browser — sign-in
 * "succeeds" but the next request arrives with no cookie. Setting
 * AUTH_COOKIE_CROSS_SITE makes every better-auth cookie SameSite=None; Secure;
 * Partitioned so it survives the third-party context. Only the embedding runtime
 * (the sandbox) sets the flag; deployed apps never do and keep the tighter Lax
 * default — first-party traffic gets no needless cross-site exposure.
 */
const crossSiteCookies = (): boolean => {
  if (typeof process === 'undefined') return false
  const v = process.env?.AUTH_COOKIE_CROSS_SITE
  return v === 'true' || v === '1'
}

const toCrossSite = (cookie: string): string => {
  let c = cookie.replace(/;\s*SameSite=(Lax|Strict|None)/gi, '')
  c += '; SameSite=None'
  if (!/;\s*Secure\b/i.test(c)) c += '; Secure'
  if (!/;\s*Partitioned\b/i.test(c)) c += '; Partitioned'
  return c
}

/**
 * Rewrite every Set-Cookie on the auth handler's response for cross-site use.
 * Read the cookies via getSetCookie() (which keeps them split) BEFORE copying
 * the rest of the headers — copying a Headers merges duplicate Set-Cookie into a
 * single comma-joined value, so we delete and re-append the clean ones.
 */
const rewriteSetCookies = (response: Response): Response => {
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : ([response.headers.get('set-cookie')].filter(Boolean) as string[])
  if (cookies.length === 0) {
    return response
  }
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const cookie of cookies) {
    headers.append('set-cookie', toCrossSite(cookie))
  }
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
