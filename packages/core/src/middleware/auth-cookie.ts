import type { SerializeOptions } from 'cookie'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
import type { RelativeTimeInput } from '../time-utils.js'
import { getRelativeTimeOffsetFromNow } from '../time-utils.js'

/** Standard JWT registered claims — present on a token even with no session. */
const JWT_REGISTERED_CLAIMS = new Set([
  'iat',
  'exp',
  'nbf',
  'iss',
  'aud',
  'sub',
  'jti',
])

/**
 * Whether a decoded payload carries an actual session, as opposed to being
 * absent or a bare JWT envelope of `{ iat, exp }`. True only for a non-null
 * object with at least one key that is not a registered JWT claim.
 */
const hasSessionIdentity = (session: unknown): boolean => {
  if (!session || typeof session !== 'object') return false
  return Object.keys(session).some((key) => !JWT_REGISTERED_CLAIMS.has(key))
}

/**
 * Reads a JWT session from a cookie, and re-issues the cookie after the
 * request whenever the session changed (e.g. after login).
 *
 * @example snippet: machineAuth
 */
export const authCookie = pikkuMiddlewareFactory<{
  /** Cookie name to read and write. */
  name: string
  /** Serialize options merged over the defaults, which are httpOnly and sameSite lax. */
  options: SerializeOptions
  /** How long the re-issued cookie lives, as a relative time such as `'7d'`. */
  expiresIn: RelativeTimeInput
}>(({ name, options, expiresIn }) => {
  const mergedOptions: SerializeOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    ...options,
  }
  return pikkuMiddleware(
    async (
      { jwt: jwtService, logger },
      { http, setSession, getSession, session, hasSessionChanged },
      next
    ) => {
      if (!http?.request || !setSession || session) {
        return next()
      }

      const cookieValue = http.request.cookie(name)
      if (cookieValue && jwtService) {
        const userSession = await jwtService.decode(cookieValue)
        // Not just truthy: a JWT of an absent session still decodes to a
        // `{ iat, exp }` object, which is truthy and which the function runner
        // would accept as a session. Require at least one claim that is not a
        // standard JWT timestamp, so an identity-less token is treated as no
        // session rather than as an authenticated one.
        if (userSession && hasSessionIdentity(userSession)) {
          setSession?.(userSession)
        }
      }

      await next()

      if (!http?.response) {
        return
      }

      if (hasSessionChanged?.()) {
        const currentSession = await getSession?.()
        // Logout path: `clearSession()` marks the session changed while leaving
        // it absent. Re-signing that into a fresh, unexpired cookie would hand
        // the browser a credential on the way out — so clear the cookie instead
        // of minting one, and never call `encode` with an absent session.
        if (!hasSessionIdentity(currentSession)) {
          http.response.cookie(name, '', {
            ...mergedOptions,
            expires: new Date(0),
            maxAge: 0,
          })
        } else if (jwtService) {
          http.response.cookie(
            name,
            await jwtService.encode(expiresIn, currentSession),
            {
              ...mergedOptions,
              expires: getRelativeTimeOffsetFromNow(expiresIn),
            }
          )
        } else {
          logger.warn('No JWT service available, unable to set cookie')
        }
      }
    }
  )
})
