import { SerializeOptions } from 'cookie'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'
import {
  getRelativeTimeOffsetFromNow,
  RelativeTimeInput,
} from '../time-utils.js'

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
      { userSession: userSessionService, jwt: jwtService, logger },
      { http },
      next
    ) => {
      if (!http?.request || userSessionService.get()) {
        return next()
      }

      // Try to decode session from cookie
      const cookieValue = http.request.cookie(name)
      if (cookieValue && jwtService) {
        const userSession = await jwtService.decode(cookieValue)
        if (userSession) {
          userSessionService.setInitial(userSession)
        }
      }

      await next()

      // Set the cookie in the response if the session has changed
      if (!http?.response) {
        return
      }

      if (userSessionService.sessionChanged) {
        const session = userSessionService.get()
        if (jwtService) {
          http.response.cookie(
            name,
            await jwtService.encode(expiresIn, session),
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
