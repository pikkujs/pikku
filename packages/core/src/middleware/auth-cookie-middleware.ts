import { PikkuMiddleware } from '../types/core.types.js'

/**
 * Cookie middleware that extracts a session from cookies.
 *
 * @param options.cookieNames - List of cookie names to check.
 * @param options.getSessionForCookieValue - Function to retrieve a session using a cookie value.
 */
export const cookieMiddleware = (
  options: {
    cookieNames?: string[]
    getSessionForCookieValue?: (
      cookieValue: string,
      cookieName: string
    ) => Promise<any>
  } = {}
): PikkuMiddleware => {
  const middleware: PikkuMiddleware = async (
    { userSessionService },
    { http },
    next
  ) => {
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    if (options.getSessionForCookieValue && options.cookieNames) {
      const cookies = http.request.getCookies()
      if (cookies) {
        let cookieName: string | undefined
        for (const name of options.cookieNames) {
          if (cookies[name]) {
            cookieName = name
            break
          }
        }
        if (cookieName) {
          const cookieValue = cookies[cookieName]
          if (cookieValue) {
            const userSession = await options.getSessionForCookieValue(
              cookieValue,
              cookieName
            )
            if (userSession) {
              await userSessionService.set(userSession)
            }
          }
        }
      }
    }
    return next()
  }
  return middleware
}
