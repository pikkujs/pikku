import { InvalidSessionError } from '../errors/errors.js'
import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
} from '../types/core.types.js'

/**
 * Extracts the Bearer token from the Authorization header
 */
export const authBearer = <
  SingletonServices extends CoreSingletonServices<CoreConfig>,
  UserSession extends CoreUserSession,
>({
  token,
  jwt,
  getSession,
}: {
  token?: {
    value: string
    userSession: UserSession
  }
  jwt?: boolean
  getSession?: (
    services: SingletonServices,
    token: string
  ) => Promise<UserSession> | UserSession
} = {}): PikkuMiddleware => {
  const middleware: PikkuMiddleware = async (services, { http }, next) => {
    // Skip if session already exists.
    if (!http?.request || services.userSessionService.get()) {
      return next()
    }

    const authHeader =
      http.request.header('authorization') ||
      http.request.header('Authorization')
    if (authHeader) {
      const [scheme, bearerToken] = authHeader.split(' ')
      if (scheme !== 'Bearer' || !token || !bearerToken) {
        throw new InvalidSessionError()
      }
      let userSession: UserSession | null = null
      if (jwt) {
        if (!services.jwt) {
          throw new Error('JWT service is required for JWT decoding.')
        }
        userSession = await services.jwt.decode(bearerToken)
      } else if (token) {
        if (bearerToken === token.value) {
          userSession = token.userSession
        }
      } else if (getSession) {
        userSession = await getSession(services as any, token)
      }

      if (userSession) {
        services.userSessionService.setInitial(userSession)
      }
    }
    return next()
  }
  return middleware
}
