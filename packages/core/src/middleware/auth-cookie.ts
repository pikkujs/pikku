import type { SerializeOptions } from 'cookie'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'
import type { RelativeTimeInput } from '../time-utils.js'
import { getRelativeTimeOffsetFromNow } from '../time-utils.js'

/**
 * Reads a JWT session from a cookie, and re-issues the cookie after the
 * request whenever the session changed (e.g. after login).
 */
export const authCookie = pikkuMiddlewareFactory<{
  name: string
  options: SerializeOptions
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
