import { InvalidSessionError } from '../errors/errors.js'
import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '../types/core.types.js'

/**
 * Extracts the Bearer token from the Authorization header
 */
export const authBearer = pikkuMiddlewareFactory<{
  token?: {
    value: string
    userSession: CoreUserSession
  }
  jwt?: boolean
  getSession?: (
    services: CoreSingletonServices<CoreConfig>,
    token: string
  ) => Promise<CoreUserSession> | CoreUserSession
}>(({ token, jwt, getSession } = {}) =>
  pikkuMiddleware(async (services, { http }, next) => {
    const { userSession: userSessionService, jwt: jwtService } = services as any
    // Skip if session already exists.
    if (!http?.request || userSessionService.get()) {
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
      let userSession: CoreUserSession | null = null
      if (jwt) {
        if (!jwtService) {
          throw new Error('JWT service is required for JWT decoding.')
        }
        userSession = await jwtService.decode(bearerToken)
      } else if (token) {
        if (bearerToken === token.value) {
          userSession = token.userSession
        }
      } else if (getSession) {
        userSession = await getSession(services as any, token)
      }

      if (userSession) {
        userSessionService.setInitial(userSession)
      }
    }
    return next()
  })
)
