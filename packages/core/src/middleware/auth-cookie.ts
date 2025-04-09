import { SerializeOptions } from 'cookie'
import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
} from '../types/core.types.js'
import {
  getRelativeTimeOffsetFromNow,
  RelativeTimeInput,
} from '../time-utils.js'

/**
 * Cookie middleware that extracts a session from cookies.
 *
 * @param options.name - List of cookie names to check.
 * @param options.getSessionForCookieValue - Function to retrieve a session using a cookie value.
 */
export const authCookie = <
  SingletonServices extends CoreSingletonServices<CoreConfig>,
  UserSession extends CoreUserSession,
>({
  name,
  getSessionForCookieValue,
  jwt,
  options,
  expiresIn,
}: {
  name: string
  options: SerializeOptions
  expiresIn: RelativeTimeInput
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
    if (!http?.request || services.userSession.get()) {
      return next()
    }

    let userSession: UserSession | null = null
    const cookieValue = http.request.cookie(name)
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
          name
        )
      }
    }

    if (userSession) {
      services.userSession.setInitial(userSession)
    }
    await next()

    // Set the cookie in the response if the session has changed
    if (!http?.response) {
      return
    }

    if (services.userSession.sessionChanged) {
      const session = services.userSession.get()
      if (jwt) {
        if (!services.jwt) {
          throw new Error('JWT service is required for JWT encoding.')
        }
        http.response.cookie(
          name,
          await services.jwt.encode(expiresIn, session),
          {
            ...options,
            expires: getRelativeTimeOffsetFromNow(expiresIn),
          }
        )
      } else {
        services.logger.warn('No JWT service available, unable to set cookie')
      }
    }
  }
  return middleware
}
