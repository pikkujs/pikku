import { InvalidSessionError } from '../errors/errors.js'
import {
  CoreUserSession,
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '../types/core.types.js'

/**
 * Bearer token middleware that extracts and validates tokens from the Authorization header.
 *
 * Supports two modes:
 * - JWT decoding (default): Decodes bearer tokens using the JWT service
 * - Static token: Provide a `token` object with a value and userSession for simple token validation
 *
 * @param options.token - Optional static token configuration { value: string, userSession: CoreUserSession }
 *
 * @example
 * ```typescript
 * import { authBearer } from '@pikku/core/middleware'
 *
 * // JWT mode (default)
 * addHTTPMiddleware('*', [
 *   authBearer()
 * ])
 *
 * // Static token mode
 * addHTTPMiddleware('*', [
 *   authBearer({
 *     token: {
 *       value: process.env.API_TOKEN,
 *       userSession: { userId: 'system', role: 'admin' }
 *     }
 *   })
 * ])
 * ```
 */
export const authBearer = pikkuMiddlewareFactory<{
  token?: {
    value: string
    userSession: CoreUserSession
  }
}>(({ token } = {}) =>
  pikkuMiddleware(
    async (
      { userSession: userSessionService, jwt: jwtService },
      { http },
      next
    ) => {
      // Skip if session already exists.
      if (!http?.request || userSessionService.get()) {
        return next()
      }

      const authHeader =
        http.request.header('authorization') ||
        http.request.header('Authorization')

      if (authHeader) {
        const [scheme, bearerToken] = authHeader.split(' ')
        if (scheme !== 'Bearer' || !bearerToken) {
          throw new InvalidSessionError()
        }

        let userSession: CoreUserSession | null = null

        // If static token provided, validate against it
        if (token && bearerToken === token.value) {
          userSession = token.userSession
        }
        // Otherwise, default to JWT decoding
        else if (jwtService && !token) {
          userSession = await jwtService.decode(bearerToken)
        }

        if (userSession) {
          userSessionService.setInitial(userSession)
        }
      }

      return next()
    }
  )
)
