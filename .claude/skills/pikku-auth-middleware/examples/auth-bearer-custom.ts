import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'
import { InvalidSessionError } from '@pikku/core/errors'

/**
 * Custom Bearer token authentication with database validation
 *
 * This example shows how to create custom middleware that validates bearer
 * tokens against a database. The core @pikku/core/middleware only supports
 * JWT-based or static token authentication, so for custom validation logic
 * (like database lookups), you should create your own middleware like this.
 *
 * The bearer token should be provided in the Authorization header:
 * Authorization: Bearer <token>
 *
 * Note: This example assumes you have a 'kysely' service configured.
 * Replace with your own database service as needed.
 */
export const customBearerAuth = pikkuMiddleware(
  async ({ userSession: userSessionService, kysely }: any, { http }, next) => {
    // Skip if session already exists or not an HTTP request
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    // Extract bearer token from Authorization header
    const authHeader =
      http.request.header('authorization') ||
      http.request.header('Authorization')

    if (authHeader) {
      const [scheme, token] = authHeader.split(' ')

      if (scheme !== 'Bearer' || !token) {
        throw new InvalidSessionError()
      }

      // Look up session by token in database
      const session = await kysely
        .selectFrom('sessions')
        .select(['userId', 'role', 'expiresAt'])
        .where('token', '=', token)
        .executeTakeFirst()

      if (!session || session.expiresAt < new Date()) {
        throw new InvalidSessionError()
      }

      // Set the session
      userSessionService.setInitial({
        userId: session.userId,
        role: session.role,
      })
    }

    return next()
  }
)
