import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
} from '../types/core.types.js'

/**
 * Cookie middleware that extracts a session from cookies.
 *
 * @param options.cookieNames - List of cookie names to check.
 * @param options.getSessionForCookieValue - Function to retrieve a session using a cookie value.
 */
export const authCookie = <
  SingletonServices extends CoreSingletonServices<CoreConfig>,
  UserSession extends CoreUserSession,
>({
  cookieNames,
  getSessionForCookieValue,
  jwt,
}: {
  cookieNames: string[]
} & (
  | {
      getSessionForCookieValue: (
        services: SingletonServices,
        cookieValue: string,
        cookieName: string
      ) => Promise<UserSession>
      jwt?: false
    }
  | {
      getSessionForCookieValue?: undefined
      jwt: true
    }
)): PikkuMiddleware => {
  const middleware: PikkuMiddleware = async (services, { http }, next) => {
    if (!http?.request || services.userSessionService.get()) {
      return next()
    }

    const cookies = http.request.getCookies()
    if (cookies) {
      let cookieName: string | undefined
      for (const name of cookieNames) {
        if (cookies[name]) {
          cookieName = name
          break
        }
      }
      if (cookieName) {
        let userSession: UserSession | null = null
        const cookieValue = cookies[cookieName]
        if (cookieValue) {
          if (jwt) {
            if (!services.jwt) {
              throw new Error('JWT service is required for JWT decoding.')
            }
            userSession = await services.jwt.decode(cookieValue)
          } else if (getSessionForCookieValue) {
            userSession = await getSessionForCookieValue(
              services as any,
              cookieValue,
              cookieName
            )
          }
          if (userSession) {
            services.userSessionService.setInitial(userSession)
          }
        }
      }
    }
    return next()
  }
  return middleware
}
