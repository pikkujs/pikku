import Credentials from '@auth/core/providers/credentials'
import { createAuthRoutes } from '@pikku/auth-js'
import type { AuthConfigOrFactory } from '@pikku/auth-js'
import { wireHTTPRoutes } from '../../.pikku/pikku-types.gen.js'
import type { SingletonServices } from '../../.pikku/pikku-types.gen.js'

const AUTH_SECRET = 'pikku-auth-js-dev-secret'

const configFactory: AuthConfigOrFactory = (services) => {
  const { todoStore } = services as SingletonServices
  return {
    providers: [
      Credentials({
        credentials: { username: {}, password: {} },
        authorize: async (credentials) => {
          const user = todoStore.getUserByUsername(
            credentials.username as string
          )
          if (!user || !(credentials.password as string)) return null
          return { id: user.id, name: user.username, email: user.email }
        },
      }),
    ],
    secret: AUTH_SECRET,
    trustHost: true,
    basePath: '/auth',
  }
}

wireHTTPRoutes({ routes: { auth: createAuthRoutes(configFactory) as any } })

export { AUTH_SECRET }
