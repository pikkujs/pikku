import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CoreServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import { getCookieCache } from 'better-auth/cookies'

/**
 * The decoded better-auth cookie-cache payload — the `{ session, user }` snapshot
 * better-auth signs into the session cookie when `session.cookieCache` is
 * enabled. `getCookieCache` verifies the signature with the secret and enforces
 * the embedded `session.expiresAt`, so this is a trustworthy, already-validated
 * value.
 */
type CachedSession = { session: any; user: any }

export type BetterAuthStatelessSessionOptions = {
  /**
   * Secret id to read the cookie-signing secret from (via `services.secrets`).
   * Defaults to `BETTER_AUTH_SECRET` — better-auth's own convention.
   */
  secretId?: string
  /**
   * Map the verified `{ session, user }` snapshot to the app session. Receives
   * the singleton services so callers can enrich the session from their own
   * data. Mirrors `betterAuthSession`'s `mapSession`.
   */
  mapSession?: (
    result: CachedSession,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
}

/**
 * Stateless better-auth session middleware.
 *
 * Unlike {@link betterAuthSession} — which resolves the session by calling
 * `services.auth().api.getSession()` and therefore pulls the *entire* better-auth
 * server (DB adapter, every route handler, plugins, password hashing; ~1.25MB)
 * into every unit that runs it — this middleware verifies the signed session
 * **cookie cache** with `better-auth/cookies` (`getCookieCache`) using only the
 * signing secret. No `services.auth()`, no DB round-trip, no full server. It
 * imports only the lightweight `better-auth/cookies` + `better-auth/crypto`
 * subpaths, so a unit registering the global `*` session middleware no longer
 * bundles the auth backend.
 *
 * REQUIRES `session.cookieCache` to be enabled in the better-auth config (so the
 * signed `{ session, user }` snapshot is written into the cookie). The tradeoff
 * is bounded staleness: server-side session revocation is not observed until the
 * cookie cache entry expires (its `maxAge`). User-initiated sign-out still
 * propagates immediately — it deletes the cookie. Keep the full server (the
 * `/api/auth/*` routes) in the auth unit; this is only the read-side bridge.
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
          // Without the secret we cannot verify — treat as anonymous rather
          // than throwing, so unauthenticated routes still serve.
          return next()
        }

        const headers = new Headers(http.request.headers())
        // The cookie name is `__Secure-`-prefixed when better-auth wrote it as a
        // secure cookie (https / production), unprefixed otherwise. NODE_ENV is
        // unreliable in serverless runtimes, so try the secure name first and
        // fall back to the plain one — only one of the two cookies exists, so at
        // most one signature verification actually runs.
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
