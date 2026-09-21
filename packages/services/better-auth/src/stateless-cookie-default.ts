import type { CoreSingletonServices } from '@pikku/core/types'
import type { BetterAuthInstance } from './define-auth.js'

/**
 * A day. Long enough that nobody is signed out mid-task, short enough that a ban
 * or a revoked session lands the same day it is issued.
 *
 * Not a guess at what every app wants — a value that is merely defensible, chosen
 * because better-auth's own 300s is not. An app that cares picks its own.
 */
export const STATELESS_COOKIE_CACHE_MAX_AGE = 60 * 60 * 24

/**
 * Set by {@link betterAuthStatelessSession} when it is constructed, which the CLI
 * does at module scope in the generated `auth-middleware.gen.ts`. The auth factory
 * runs later, when singleton services are built, so by the time the default below
 * is considered this flag is settled.
 *
 * It is what scopes the default to the configuration that needs it. Under the
 * stateful middleware the cookie cache is a cache in front of the database and a
 * short life is the correct, deliberate trade; lengthening it there would silently
 * widen someone's revocation window.
 */
let statelessSessionInUse = false

/** @internal Called by `betterAuthStatelessSession`. */
export const markStatelessSessionInUse = (): void => {
  statelessSessionInUse = true
}

/** @internal Test seam. */
export const resetStatelessSessionInUse = (): void => {
  statelessSessionInUse = false
}

/**
 * Give the session cookie a usable lifetime when the app did not choose one.
 *
 * `betterAuthStatelessSession` verifies the signed `session_data` cookie with the
 * secret alone — no `services.auth()`, no database. That makes the cookie the ONLY
 * thing authenticating a request, and better-auth's unset-`maxAge` default of 300
 * seconds is then not a cache expiry but a hard session limit: five minutes after
 * signing in, every request 403s while the user's `session_token` is still good for
 * a week. Nothing rewrites the cookie in between, because a pikku app talks to its
 * RPCs and never calls `/api/auth/*` again after sign-in.
 *
 * So the default is inserted, never upserted. An explicit `maxAge` — including a
 * short one — is the author's decision and is left exactly as written. The check
 * reads the app's own options object, so "did they choose?" is answered precisely
 * rather than inferred from the resolved 300.
 *
 * The write lands on `authCookies`, because that is the only place the value is
 * still live. `createContext` resolves `getCookies(options)` once at construction,
 * and from then on every consumer — the cookie's own `Max-Age`, the HMAC's expiry,
 * the JWE/JWT `exp` — reads `authCookies.sessionData.attributes.maxAge`. Mutating
 * `options` after the fact would change nothing.
 */
export const applyStatelessCookieCacheDefault = async (
  instance: BetterAuthInstance,
  logger?: CoreSingletonServices['logger']
): Promise<void> => {
  if (!statelessSessionInUse) return

  const options = (instance as any)?.options
  const cookieCache = options?.session?.cookieCache

  /* No cookie cache means the stateless middleware can never resolve a session at
     all — a misconfiguration this default would only paper over. Leave it loud. */
  if (!cookieCache || cookieCache.enabled === false) return

  /* Insert, not upsert. */
  if (cookieCache.maxAge !== undefined) return

  let attributes: { maxAge?: number } | undefined
  try {
    const context = await (instance as any).$context
    attributes = context?.authCookies?.sessionData?.attributes
  } catch (error: any) {
    logger?.error(
      `pikku: could not read better-auth's context to default session.cookieCache.maxAge (${error?.message ?? error}). Set it explicitly in your betterAuth config — betterAuthStatelessSession has no database behind it, so the 300s default signs users out five minutes after they log in.`
    )
    return
  }

  if (!attributes) {
    logger?.error(
      "pikku: better-auth's cookie attributes were not where this version expects them, so session.cookieCache.maxAge was left at its 300s default. Set it explicitly in your betterAuth config — betterAuthStatelessSession has no database behind it, so users will be signed out five minutes after they log in."
    )
    return
  }

  attributes.maxAge = STATELESS_COOKIE_CACHE_MAX_AGE

  /* Minted from the same expression, so it carries the same broken default. */
  const accountAttributes = (await (instance as any).$context)?.authCookies
    ?.accountData?.attributes
  if (accountAttributes) {
    accountAttributes.maxAge = STATELESS_COOKIE_CACHE_MAX_AGE
  }

  logger?.info(
    `pikku: defaulted session.cookieCache.maxAge to ${STATELESS_COOKIE_CACHE_MAX_AGE}s (one day) because betterAuthStatelessSession authenticates from the cookie alone and better-auth's 300s default would sign users out five minutes after login. Set session.cookieCache.maxAge in your betterAuth config to choose your own — it is also the longest a ban or a revoked session can go unnoticed.`
  )
}
