import type { SerializeOptions } from 'cookie'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'
import type { RelativeTimeInput } from '../time-utils.js'
import { getRelativeTimeOffsetFromNow } from '../time-utils.js'

/**
 * Cookie-based session middleware that uses JWT for encoding/decoding session data.
 *
 * Reads session from a cookie on incoming requests and automatically updates the cookie
 * when the session changes (e.g., after login).
 *
 * @param options.name - Cookie name
 * @param options.expiresIn - Cookie expiration time (e.g., { value: 30, unit: 'day' })
 * @param options.options - Cookie serialization options (httpOnly, secure, sameSite, etc.)
 *
 * @example
 * ```typescript
 * import { authCookie } from '@pikku/core/middleware'
 *
 * addHTTPMiddleware([
 *   authCookie({
 *     name: 'session',
 *     expiresIn: { value: 30, unit: 'day' },
 *     options: {
 *       httpOnly: true,
 *       secure: true,
 *       sameSite: 'strict',
 *       path: '/'
 *     }
 *   })
 * ])
 * ```
 */
export const authCookie = pikkuMiddlewareFactory<{
  name: string
  options: SerializeOptions
  expiresIn: RelativeTimeInput
}>(({ name, options, expiresIn }) =>
  pikkuMiddleware(
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
        if (userSession) {
          setSession?.(userSession)
        }
      }

      await next()

      if (!http?.response) {
        return
      }

      if (hasSessionChanged?.()) {
        const currentSession = await getSession?.()
        if (jwtService) {
          http.response.cookie(
            name,
            await jwtService.encode(expiresIn, currentSession),
            {
              ...options,
              expires: getRelativeTimeOffsetFromNow(expiresIn),
            }
          )
        } else {
          logger.warn('No JWT service available, unable to set cookie')
        }
      }
    }
  )
)
