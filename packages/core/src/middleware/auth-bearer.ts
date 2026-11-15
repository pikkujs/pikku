import { InvalidSessionError } from '../errors/errors.js'
import type {
  CoreSingletonServices,
  CoreUserSession,
} from '../types/core.types.js'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
import { timingSafeStringEqual } from '../utils/hmac.js'

/**
 * Validates a bearer token: JWT-decoded by default, or compared in constant
 * time against a static `value` or a `secretId` resolved through the secrets
 * service per request. Pass `verify` instead to look the token up yourself
 * (opaque, hashed or revocable tokens); it fails closed.
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
  /**
   * Custom verifier for opaque tokens. Receives the raw bearer token and the
   * singleton services, and returns the session, or `null` for a token it does
   * not accept. Returning `null`, a non-object, or throwing answers 401
   * (`InvalidSessionError`) with no detail from the verifier, so a bad token is
   * never treated as anonymous. The token is never logged by this middleware;
   * do not log it in the verifier. Cannot be combined with `token`.
   */
  verify?: (
    token: string,
    services: CoreSingletonServices
  ) => Promise<CoreUserSession | null>
}>(({ token, verify } = {}) => {
  if (token && verify) {
    throw new Error('authBearer: pass either `token` or `verify`, not both')
  }
  return pikkuMiddleware(
    async (services, { http, setInitialSession, session }, next) => {
      const { jwt: jwtService, secrets } = services
      if (!http?.request || !setInitialSession || session) {
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

        if (verify) {
          // Fail closed. The caught error is dropped, not chained: a verifier
          // that interpolated the token into its message must not leak it.
          let verified: CoreUserSession | null = null
          try {
            verified = await verify(bearerToken, services)
          } catch {
            throw new InvalidSessionError()
          }
          if (!verified || typeof verified !== 'object') {
            throw new InvalidSessionError()
          }
          userSession = verified
        } else if (token) {
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
          setInitialSession?.(userSession)
        }
      }

      return next()
    }
  )
})
