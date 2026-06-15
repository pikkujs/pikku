import type { CoreUserSession, CorePikkuMiddleware } from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import { toWebRequest } from '@pikku/core/http'
import type { DefinedAuth } from './define-auth.js'

type BetterAuthSessionResult = { user: any; session: any }

type BetterAuthSessionOptions = {
  /** The `defineAuth(...)` value — used to resolve the better-auth instance. */
  auth: DefinedAuth
  /** Map better-auth's `{ user, session }` onto the Pikku session. Defaults to
   *  `{ userId: user.id }`. */
  mapSession?: (result: BetterAuthSessionResult) => CoreUserSession
}

/**
 * Middleware that bridges a better-auth session into the Pikku session on every
 * request. It reads the session via better-auth's own `api.getSession` (cookie
 * verification, DB lookup, plugin enrichment all happen inside better-auth), so
 * Pikku never decodes tokens itself.
 *
 * The Pikku session is read-only here: mutations go through better-auth's own
 * `/api/auth/*` routes (sign-in/out), not by setting the Pikku session.
 *
 * Usage:
 * ```ts
 * import { auth } from './auth.js'
 * addHTTPMiddleware('*', [betterAuthSession({ auth })])
 * ```
 */
export const betterAuthSession = (
  options: BetterAuthSessionOptions
): CorePikkuMiddleware => {
  const { auth, mapSession } = options
  return pikkuMiddleware(async (services, { http, setSession, session }, next) => {
    if (!http?.request || !setSession || session) {
      return next()
    }

    try {
      const instance = await auth.getInstance(services)
      const webRequest = toWebRequest(http.request)
      const result = (await instance.api.getSession({
        headers: webRequest.headers,
      })) as BetterAuthSessionResult | null

      if (result?.user) {
        setSession(
          mapSession
            ? mapSession(result)
            : ({ userId: result.user.id } as CoreUserSession)
        )
      }
    } catch (e: any) {
      services.logger?.warn(`better-auth session read failed: ${e?.message}`)
    }

    return next()
  })
}
