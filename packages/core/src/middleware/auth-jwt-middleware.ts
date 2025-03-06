import { InvalidSessionError } from '../errors/errors.js'
import { PikkuMiddleware } from '../types/core.types.js'

/**
 * JWT middleware that extracts the Bearer token from the Authorization header,
 * decodes it via the jwtService, and sets the session if found.
 *
 * @param options.debugJWTDecode - Optional flag for debugging the JWT decode process.
 */
export const jwtMiddleware = (
  options: { debugJWTDecode?: boolean } = {}
): PikkuMiddleware => {
  const middleware: PikkuMiddleware = async (
    { jwt, userSessionService },
    { http },
    next
  ) => {
    if (!jwt) {
      throw new Error('JWT service not found')
    }

    // Skip if session already exists.
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    const authHeader =
      http.request.getHeader('authorization') ||
      http.request.getHeader('Authorization')
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ')
      if (scheme !== 'Bearer' || !token) {
        throw new InvalidSessionError()
      }
      const userSession = await jwt.decode<any>(
        token,
        undefined,
        options.debugJWTDecode
      )
      if (userSession) {
        await userSessionService.set(userSession)
      }
    }
    return next()
  }
  return middleware
}
