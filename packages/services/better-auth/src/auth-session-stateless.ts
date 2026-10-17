import { pikkuMiddleware } from '@pikku/core/middleware'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import type {
  CorePikkuMiddleware,
  MiddlewarePriority,
} from '@pikku/core/middleware'
import { getCookieCache, parseCookies } from 'better-auth/cookies'
import type { ImpersonationOptions } from './auth-session-impersonation.js'
import { mergeRelayedCookies } from './cross-site-cookies.js'
import {
  hasLiveSession,
  readSessionSecret,
  resolveAndSetSession,
} from './resolve-session.js'
import { markStatelessSessionInUse } from './stateless-cookie-default.js'

type CachedSession = { session: any; user: any }

type GetCookieCacheConfig = NonNullable<Parameters<typeof getCookieCache>[1]>

/** How the app's `session.cookieCache` encodes the `session_data` cookie. */
export type CookieCacheStrategy = NonNullable<GetCookieCacheConfig['strategy']>

/**
 * The parts of the app's own `betterAuth({ session: { cookieCache } })` the
 * cookie has to be read back with. They are passed here rather than read off
 * the auth instance because this middleware exists to never build one.
 */
export type StatelessCookieCacheOptions = {
  /**
   * The `cookieCache.strategy` the app signs with. Left unset, the strategy is
   * recognised from the cookie's shape — each one still verifies against the
   * secret, so this only pins it.
   */
  strategy?: CookieCacheStrategy
  /**
   * The app's `cookieCache.version`. Required whenever the app sets one: it is
   * how a version bump invalidates outstanding cookies, and a cookie of any
   * version verifies here without it.
   */
  version?: GetCookieCacheConfig['version']
  /** `cookieCache.jwt` for the `jwt` strategy, e.g. a JWKS to verify with. */
  jwt?: GetCookieCacheConfig['jwt']
}

/** Options for {@link betterAuthStatelessSession}. */
export type BetterAuthStatelessSessionOptions = {
  /** Secret the cookie is signed with. Defaults to `BETTER_AUTH_SECRET`. */
  secretId?: string
  /** The app's `advanced.cookiePrefix`. Defaults to better-auth's own `better-auth`. */
  cookiePrefix?: string
  /** How the app's `session.cookieCache` writes the cookie. */
  cookieCache?: StatelessCookieCacheOptions
  /** Map the cached `{ user, session }` to the app session. */
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
  /**
   * Where this sits in the middleware order. The CLI generates its default-map
   * registration at `lowest` so an app's own registration (default `medium`)
   * resolves the session first and this one short-circuits on `session`.
   */
  priority?: MiddlewarePriority
}

const DEFAULT_COOKIE_PREFIX = 'better-auth'
const SESSION_DATA_COOKIE = 'session_data'

/**
 * The `session_data` value, reassembled when better-auth chunked it across
 * `name.0`, `name.1`, … because it outgrew one cookie.
 */
const readSessionDataCookie = (
  headers: Headers,
  cookiePrefix: string,
  isSecure: boolean
): string | null => {
  const name = `${isSecure ? '__Secure-' : ''}${cookiePrefix}.${SESSION_DATA_COOKIE}`
  const cookies = parseCookies(headers.get('cookie') ?? '')
  const whole = cookies.get(name)
  if (whole) {
    return whole
  }
  const chunks = [...cookies.entries()]
    .filter(([key]) => key.startsWith(`${name}.`))
    .map(([key, value]) => ({
      index: Number(key.slice(name.length + 1)),
      value,
    }))
    .filter(({ index }) => Number.isInteger(index))
    .sort((a, b) => a.index - b.index)
  return chunks.length > 0 ? chunks.map(({ value }) => value).join('') : null
}

/**
 * A compact cookie is one base64url segment, a JWT three dot-separated parts
 * and a JWE five. Recognising it is safe because each strategy still verifies
 * the value against the secret.
 */
const strategyOf = (value: string): CookieCacheStrategy => {
  const parts = value.split('.').length
  return parts === 5 ? 'jwe' : parts === 3 ? 'jwt' : 'compact'
}

/**
 * Stateless better-auth session middleware: verifies the signed session cookie
 * cache via `getCookieCache` using only the signing secret — no `services.auth()`,
 * no DB, no full server bundled. The lean alternative to {@link betterAuthSession}.
 *
 * REQUIRES `session.cookieCache` enabled in the better-auth config. Tradeoff:
 * server-side revocation isn't seen until the cookie cache expires; sign-out is
 * still immediate (it deletes the cookie).
 *
 * That expiry is `session.cookieCache.maxAge`, and here it is not a cache expiry
 * but a hard session limit — there is no database to fall back to when the cookie
 * ages out. better-auth defaults it to 300 seconds, which signs everyone out five
 * minutes after they log in, so `pikkuBetterAuth` inserts a day when the app set
 * no value of its own (see stateless-cookie-default.ts). Set it explicitly to
 * choose the trade: it is the longest a ban or a revoked session can go unnoticed,
 * paid for in database reads.
 *
 * That last part is the browser's to keep under AUTH_COOKIE_CROSS_SITE: a
 * relayed cookie lives in the client's own storage, so deleting the real cookie
 * cannot reach it. A client implementing the relay MUST drop the entries the
 * sign-out response expires; if it does not, the stale cache blob keeps
 * verifying here until it ages out on its own (see cross-site-cookies.ts).
 *
 * The cookie is read back the way the app wrote it: pass `cookiePrefix` and
 * `cookieCache.version` when the app sets them (see
 * {@link StatelessCookieCacheOptions}). `pikkuBetterAuth` logs an error at
 * startup when they disagree with the auth config.
 *
 * The one exception to "no DB": if a `ScopeService` is registered, scopes are
 * resolved per request (see {@link withResolvedScopes}), which costs a query.
 * That is the price of grants that take effect immediately; leave the service
 * unregistered, or have `mapSession` set `scopes` itself, to stay query-free.
 *
 * @example snippet: betterAuthStatelessSession
 */
export const betterAuthStatelessSession = (
  options: BetterAuthStatelessSessionOptions = {}
): CorePikkuMiddleware => {
  const {
    mapSession,
    impersonation,
    priority,
    secretId = 'BETTER_AUTH_SECRET',
    cookiePrefix = DEFAULT_COOKIE_PREFIX,
    cookieCache = {},
  } = options

  /*
   * Tell the auth factory that the cookie is now the only thing authenticating a
   * request, so it can default `session.cookieCache.maxAge` to something survivable
   * instead of better-auth's 300s. Constructed at module scope by the generated
   * `auth-middleware.gen.ts`, long before the factory runs.
   */
  markStatelessSessionInUse({ cookiePrefix, cookieCache })

  return pikkuMiddleware({
    priority,
    func: async (services, wire, next) => {
      const { http, setInitialSession } = wire
      if (
        !http?.request ||
        !setInitialSession ||
        (await hasLiveSession(wire))
      ) {
        return next()
      }
      const request = http.request

      const secret = await readSessionSecret(
        services,
        secretId,
        'betterAuthStatelessSession'
      )
      if (!secret) {
        return next()
      }

      // Read the cached session in its own try: a genuine read failure must
      // surface. The normal "no valid cookie" path returns null here — it does
      // not throw.
      let cached: CachedSession | null = null
      const headers = mergeRelayedCookies(new Headers(request.headers()))
      try {
        // Cookie is `__Secure-`-prefixed when secure, unprefixed otherwise; try
        // both since NODE_ENV is unreliable in serverless. Only one cookie exists.
        for (const isSecure of [true, false]) {
          const value = readSessionDataCookie(headers, cookiePrefix, isSecure)
          if (!value) {
            continue
          }
          cached = (await getCookieCache(headers, {
            secret,
            isSecure,
            cookiePrefix,
            strategy: cookieCache.strategy ?? strategyOf(value),
            version: cookieCache.version,
            jwt: cookieCache.jwt,
          })) as CachedSession | null
          break
        }
      } catch (e: any) {
        services.logger?.error(
          `better-auth stateless session read failed: ${e?.message ?? e}`
        )
        throw e
      }

      if (cached?.user) {
        await resolveAndSetSession({
          result: cached,
          services,
          getHeader: (name) => headers.get(name),
          setInitialSession,
          mapSession,
          impersonation,
        })
      }

      return next()
    },
  })
}
