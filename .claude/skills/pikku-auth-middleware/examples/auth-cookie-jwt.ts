import { authCookie } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * Cookie-based authentication using JWT
 *
 * - Reads session cookie and decodes JWT
 * - Automatically updates cookie when session changes
 * - Cookie is httpOnly and secure
 */
export const cookieJWT = authCookie({
  name: 'session',
  jwt: true,
  expiresIn: { value: 7, unit: 'day' },
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  },
})

addHTTPMiddleware([cookieJWT])
