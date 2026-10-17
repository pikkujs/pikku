import { InvalidSessionError } from '../errors/errors.js'
import type { CoreUserSession } from '../types/core.types.js'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
import { timingSafeStringEqual } from '../utils/hmac.js'

/**
 * Validates a bearer token: JWT-decoded by default, or compared in constant
 * time against a static `value` or a `secretId` resolved through the secrets
 * service per request.
 *
 * @example snippet: machineAuth
 */
export const authBearer = pikkuMiddlewareFactory<{
  /** Omit to JWT-decode the token. Set it to accept one fixed token instead, matched in constant time. */
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
          if (expected && timingSafeStringEqual(bearerToken, expected)) {
            userSession = token.userSession
          }
        } else if (jwtService) {
          userSession = await jwtService.decode(bearerToken)
        }

        if (userSession) {
          await setSession?.(userSession)
        }
      }

      return next()
    }
  )
)
