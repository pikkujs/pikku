import { authAPIKey } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * API key authentication with database lookup
 *
 * The API key is looked up in the database to find the associated user session.
 */
export const apiKeyDatabase = authAPIKey({
  source: 'header', // Only check x-api-key header
  getSessionForAPIKey: async ({ database }, apiKey) => {
    const user = await database.query('users', {
      where: { apiKey },
    })

    if (!user) {
      throw new Error('Invalid API key')
    }

    return {
      userId: user.id,
      role: user.role,
    }
  },
})

// Apply globally
addHTTPMiddleware([apiKeyDatabase])
