import { authBearer } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * Bearer token authentication with custom validation
 *
 * Looks up the bearer token in the database to validate and get session.
 */
export const bearerCustom = authBearer({
  getSession: async ({ database }, token) => {
    const session = await database.query('sessions', {
      where: { token },
    })

    if (!session || session.expiresAt < Date.now()) {
      throw new Error('Invalid or expired token')
    }

    return {
      userId: session.userId,
      role: session.role,
    }
  },
})

addHTTPMiddleware([bearerCustom])
