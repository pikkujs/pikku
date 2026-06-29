import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CoreServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import { getCookieCache } from 'better-auth/cookies'

type CachedSession = { session: any; user: any }

export type BetterAuthStatelessSessionOptions = {
  secretId?: string
  mapSession?: (
    result: CachedSession,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
}

/**
 * Stateless better-auth session middleware: verifies the signed session cookie
 * cache via `getCookieCache` using only the signing secret — no `services.auth()`,
 * no DB, no full server bundled. The lean alternative to {@link betterAuthSession}.
 *
 * REQUIRES `session.cookieCache` enabled in the better-auth config. Tradeoff:
 * server-side revocation isn't seen until the cookie cache expires; sign-out is
 * still immediate (it deletes the cookie).
 */
export const betterAuthStatelessSession = (
  options: BetterAuthStatelessSessionOptions = {}
): CorePikkuMiddleware => {
  const { mapSession, secretId = 'BETTER_AUTH_SECRET' } = options

  return pikkuMiddleware(
    async (services, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
        return next()
      }

      try {
        const secret = await (services as any).secrets?.getSecret(secretId)
        if (!secret) {
          return next()
        }

        const headers = new Headers(http.request.headers())
        // Cookie is `__Secure-`-prefixed when secure, unprefixed otherwise; try
        // both since NODE_ENV is unreliable in serverless. Only one cookie exists.
        const cached =
          ((await getCookieCache(headers, {
            secret,
            isSecure: true,
          })) as CachedSession | null) ??
          ((await getCookieCache(headers, {
            secret,
            isSecure: false,
          })) as CachedSession | null)

        if (cached?.user) {
          setSession(
            mapSession
              ? await mapSession(cached, services as CoreServices)
              : ({ userId: cached.user.id } as CoreUserSession)
          )
        }
      } catch (e: any) {
        services.logger?.warn(
          `better-auth stateless session read failed: ${e?.message}`
        )
      }

      return next()
    }
  )
}
