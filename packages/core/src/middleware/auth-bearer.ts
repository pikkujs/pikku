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
 * Validates a bearer token: JWT-decoded by default, or compared in constant
 * time against a static `value` or a `secretId` resolved through the secrets
 * service per request.
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
            const stored = await secrets
              ?.getSecret<string>(token.secretId)
              .catch(() => undefined)
            expected = stored?.reveal()
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
