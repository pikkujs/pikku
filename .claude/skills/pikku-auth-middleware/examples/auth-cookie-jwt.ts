import { authCookie } from '@pikku/core/middleware'

/**
 * Cookie-based authentication using JWT
 *
 * Reads session from cookies using JWT and automatically updates cookies when session changes.
 * The JWT service must be configured for this middleware to work.
 *
 * Example usage:
 * ```typescript
 * import { cookieJWT } from './middleware'
 *
 * addHTTPMiddleware('*', [cookieJWT])
 * ```
 */
export const cookieJWT = authCookie({
  name: 'pikku:session',
  expiresIn: { value: 4, unit: 'week' },
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  },
})
