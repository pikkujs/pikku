import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'

/**
 * Custom cookie-based authentication with custom encoding
 *
 * This example shows how to create custom middleware that uses cookies
 * with a custom encoding scheme (not JWT). The core @pikku/core/middleware
 * only supports JWT-based cookies, so for custom encoding logic, you should
 * create your own middleware like this.
 *
 * The cookie contains the encoded session data directly (no database lookup).
 * When the session changes (e.g., after login), the cookie is updated.
 */
export const customCookieAuth = pikkuMiddleware(
  async ({ userSession: userSessionService }, { http }, next) => {
    // Skip if session already exists or not an HTTP request
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    // Read and decode session from cookie
    const cookieValue = http.request.cookie('session')

    if (cookieValue) {
      try {
        // Decode your custom cookie format (e.g., base64, encrypted, signed, etc.)
        const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
        const session = JSON.parse(decoded)

        // Validate session hasn't expired
        if (session.expiresAt && session.expiresAt > Date.now()) {
          userSessionService.setInitial({
            userId: session.userId,
            role: session.role,
          })
        }
      } catch (err) {
        // Invalid cookie format, skip
      }
    }

    await next()

    // If session changed (e.g., user logged in), update the cookie
    if (http?.response && userSessionService.sessionChanged) {
      const session: any = userSessionService.get()

      if (session) {
        // Encode session with your custom format
        const sessionData = {
          userId: session.userId,
          role: session.role,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        }
        const encoded = Buffer.from(JSON.stringify(sessionData)).toString(
          'base64'
        )

        // Set cookie
        http.response.cookie('session', encoded, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          expires: new Date(sessionData.expiresAt),
        })
      }
    }
  }
)
