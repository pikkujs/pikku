import { betterAuthSession } from '@pikku/better-auth'
import { addHTTPMiddleware } from '#pikku/middleware'

/** The app's own session middleware (runs before the generated one): better-auth getSession, session = { userId, permissions }. */
addHTTPMiddleware('*', [
  betterAuthSession({
    mapSession: ({ user }) => ({
      userId: user.id,
      permissions: user.permissions as string,
    }),
  }),
])
