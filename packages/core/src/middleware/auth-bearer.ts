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
 * Supports three modes:
 * - JWT decoding (default): Decodes bearer tokens using the JWT service
 * - Static token: Provide a `token` object with a value and userSession for simple token validation
 * - Secret-resolved token: Provide a `token` object with a secretId — the expected
 *   value is resolved through the secrets service per request, so it works with any
 *   secret backend and the middleware is a no-op while the secret is unset
 *
 * @param options.token - Optional token configuration: { value, userSession } or { secretId, userSession }
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
 *
 * // Secret-resolved token mode
 * addHTTPMiddleware('*', [
 *   authBearer({
 *     token: {
 *       secretId: 'PIKKU_CONSOLE_TOKEN',
 *       userSession: { userId: 'pikku-console-token' }
 *     }
 *   })
 * ])
 * ```
 */
export const authBearer = pikkuMiddlewareFactory<{
  token?:
    | {
        value: string
        userSession: CoreUserSession
      }
    | {
        secretId: string
        userSession: CoreUserSession
      }
}>(({ token } = {}) =>
  pikkuMiddleware(
    async (
      { jwt: jwtService, secrets },
      { http, setSession, session },
      next
    ) => {
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

        if (token) {
          let expected: string | undefined
          if ('value' in token) {
            expected = token.value
          } else {
            // An unset secret means the feature is off — never a request error.
            expected = await secrets
              ?.getSecret<string>(token.secretId)
              .catch(() => undefined)
          }
          if (expected && constantTimeEqual(bearerToken, expected)) {
            userSession = token.userSession
          }
        } else if (jwtService) {
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
