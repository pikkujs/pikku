import { defineVariable } from '@pikku/core/variable'
import { z } from 'zod'
import type { SingletonServices } from '#pikku/function'

/**
 * How long a minted `session_data` cookie is trusted for.
 *
 * This is the one number that decides two things at once, which is why it is a
 * variable rather than a constant: under `betterAuthStatelessSession` the cookie
 * is the ONLY thing that authenticates a request — the middleware verifies its
 * signature with the secret and never reaches the database — so the value is both
 *
 *   - how long the API will keep serving a request without consulting the
 *     database, and therefore the longest a ban or a revoked session can go
 *     unnoticed (`pikkuBan()` in auth.ts is the half that does the refusing), and
 *   - how long a browser that has been closed can come back and still be signed
 *     in without a round trip.
 *
 * A day suits an ordinary app. Something handling money or health records wants
 * it shorter and pays for it in database reads; nothing needs it longer, because
 * the app re-mints the cookie while it is open and heals an expired one on the
 * spot (apps/app/src/lib/session-refresh.ts). It is NOT the session length —
 * that stays `session.expiresIn`, better-auth's rolling seven days.
 */
export const DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE = 60 * 60 * 24

/*
 * The CLI requires `schema` to be a named export, not an inline `z.string()`.
 *
 * It is a string, and deliberately not `z.coerce.number()`: TypedVariablesService
 * hands a host's stored value straight back and only runs the schema to resolve a
 * default, so a number schema would type the value as `number` while the host
 * supplied the string it was configured with. Parsing belongs below, where a
 * value that is not a positive number can be reported rather than become NaN.
 */
export const SessionCookieCacheMaxAgeSchema = z
  .string()
  .default(String(DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE))

defineVariable({
  name: 'sessionCookieCacheMaxAge',
  displayName: 'Session Cookie Lifetime (seconds)',
  description:
    'How long the signed session cookie is trusted before the API re-reads the session from the database. Also the longest a ban or a revoked session can go unnoticed. Defaults to 86400 (one day).',
  variableId: 'SESSION_COOKIE_CACHE_MAX_AGE',
  schema: SessionCookieCacheMaxAgeSchema,
  optional: true,
})

/**
 * The configured cookie lifetime in seconds, or the default when nothing sensible
 * was configured. A bad value is logged rather than swallowed: silently falling
 * back would hide exactly the kind of misconfiguration that signs everybody out.
 */
export async function sessionCookieCacheMaxAge(
  variables: SingletonServices['variables'],
  logger?: SingletonServices['logger'],
): Promise<number> {
  const configured = await variables.get('SESSION_COOKIE_CACHE_MAX_AGE')
  if (configured === undefined) {
    return DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE
  }
  const seconds = Number(configured)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    logger?.warn(
      `SESSION_COOKIE_CACHE_MAX_AGE is not a positive number of seconds (got "${configured}") — using the default of ${DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE}.`,
    )
    return DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE
  }
  return seconds
}
