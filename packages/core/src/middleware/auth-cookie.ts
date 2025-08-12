import { SerializeOptions } from 'cookie'
import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
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
)): CorePikkuMiddleware => {
  const middleware: CorePikkuMiddleware = async (services, { http }, next) => {
    const {
      userSession: userSessionService,
      jwt: jwtService,
      logger,
    } = services as any
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    let userSession: UserSession | null = null
    const cookieValue = http.request.cookie(name)
    if (cookieValue) {
      if (jwt) {
        if (!jwtService) {
          throw new Error('JWT service is required for JWT decoding.')
        }
        userSession = await jwtService.decode(cookieValue)
      } else if (getSessionForCookieValue) {
        userSession = await getSessionForCookieValue(
          services as any,
          cookieValue,
          name
        )
      }
    }

    if (userSession) {
      userSessionService.setInitial(userSession)
    }
    await next()

    // Set the cookie in the response if the session has changed
    if (!http?.response) {
      return
    }

    if (userSessionService.sessionChanged) {
      const session = userSessionService.get()
      if (jwt) {
        if (!jwtService) {
          throw new Error('JWT service is required for JWT encoding.')
        }
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
  return middleware
}
