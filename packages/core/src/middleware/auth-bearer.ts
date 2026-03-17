import { InvalidSessionError } from '../errors/errors.js'
import type { CoreUserSession } from '../types/core.types.js'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

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
    async ({ jwt: jwtService }, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
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

        if (token && constantTimeEqual(bearerToken, token.value)) {
          userSession = token.userSession
        } else if (jwtService && !token) {
          userSession = await jwtService.decode(bearerToken)
        }

        if (userSession) {
          setSession?.(userSession)
        }
      }

      return next()
    }
  )
)
