import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CoreServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import { getCookieCache } from 'better-auth/cookies'
import {
  resolveImpersonatedSession,
  type ImpersonationOptions,
} from './auth-session-impersonation.js'
import { stampActorFlag } from './stamp-actor-flag.js'

type CachedSession = { session: any; user: any }

export type BetterAuthStatelessSessionOptions = {
  secretId?: string
  mapSession?: (
    result: CachedSession,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
  /**
   * Optional admin impersonation, mirroring {@link betterAuthSession}. When the
   * configured header carries a target user id and the real caller passes
   * `canImpersonate`, the session resolves as the target (via `loadUser`).
   */
  impersonation?: ImpersonationOptions
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
  const { mapSession, impersonation, secretId = 'BETTER_AUTH_SECRET' } = options

  return pikkuMiddleware(
    async (services, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
        return next()
      }
      // Capture the narrowed request so the deferred impersonation header reader
      // below keeps the non-null type.
      const request = http.request

      let secret: string | undefined
      try {
        secret = await (services as any).secrets?.getSecret(secretId)
      } catch (e: any) {
        if (e?.message !== 'Requested secret not found') throw e
        services.logger?.error(
          `betterAuthStatelessSession: secret '${secretId}' not found — session middleware skipped. Ensure ${secretId} is configured.`
        )
        return next()
      }
      if (!secret) {
        return next()
      }

      // Read the cached session in its own try: a genuine read failure must
      // surface. The normal "no valid cookie" path returns null here — it does
      // not throw.
      let cached: CachedSession | null
      try {
        const headers = new Headers(request.headers())
        // Cookie is `__Secure-`-prefixed when secure, unprefixed otherwise; try
        // both since NODE_ENV is unreliable in serverless. Only one cookie exists.
        cached =
          ((await getCookieCache(headers, {
            secret,
            isSecure: true,
          })) as CachedSession | null) ??
          ((await getCookieCache(headers, {
            secret,
            isSecure: false,
          })) as CachedSession | null)
      } catch (e: any) {
        services.logger?.error(
          `better-auth stateless session read failed: ${e?.message ?? e}`
        )
        throw e
      }

      // mapSession / impersonation hooks are caller code — let their errors
      // propagate (see betterAuthSession). A swallowed assertion turns a
      // malformed session into a silent 403.
      if (cached?.user) {
        if (impersonation) {
          const impersonated = await resolveImpersonatedSession(
            cached,
            impersonation,
            services as CoreServices,
            (name) => request.header(name),
            mapSession
          )
          if (impersonated) {
            setSession(impersonated)
            return next()
          }
        }
        const mapped = mapSession
          ? await mapSession(cached, services as CoreServices)
          : ({ userId: cached.user.id } as CoreUserSession)
        setSession(stampActorFlag(mapped, cached.user))
      }

      return next()
    }
  )
}
