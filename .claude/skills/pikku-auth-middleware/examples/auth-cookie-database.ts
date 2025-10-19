import { authCookie } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * Cookie-based authentication with database session lookup
 *
 * - Cookie contains session ID
 * - Session data is looked up in database
 * - Validates session hasn't expired
 */
export const cookieDatabase = authCookie({
  name: 'sid',
  expiresIn: { value: 30, unit: 'day' },
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  },
  getSessionForCookieValue: async ({ database }, sessionId) => {
    const session = await database.query('sessions', {
      where: { id: sessionId },
    })

    if (!session || session.expiresAt < Date.now()) {
      return null
    }

    return {
      userId: session.userId,
      role: session.role,
    }
  },
})

addHTTPMiddleware([cookieDatabase])
