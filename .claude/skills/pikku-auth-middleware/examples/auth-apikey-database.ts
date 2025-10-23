import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'

/**
 * Custom API key authentication with database lookup
 *
 * This example shows how to create custom middleware that looks up API keys
 * in a database. The core @pikku/core/middleware only supports JWT-based
 * authentication, so for custom authentication logic, you should create
 * your own middleware like this.
 *
 * The API key can be provided via:
 * - x-api-key header
 * - apiKey query parameter
 *
 * Note: This example assumes you have a 'kysely' service configured.
 * Replace with your own database service as needed.
 */
export const customAPIKeyAuth = pikkuMiddleware(
  async ({ userSession: userSessionService, kysely }: any, { http }, next) => {
    // Skip if session already exists or not an HTTP request
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    // Check for API key in header or query
    let apiKey =
      (http.request.header('x-api-key') as string | null) ||
      (http.request.query().apiKey as string | null)

    if (apiKey) {
      // Look up user by API key in database
      const user = await kysely
        .selectFrom('users')
        .select(['id', 'role'])
        .where('apiKey', '=', apiKey)
        .executeTakeFirst()

      if (user) {
        // Set the session
        userSessionService.setInitial({
          userId: user.id,
          role: user.role,
        })
      }
    }

    return next()
  }
)
