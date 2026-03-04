import Credentials from '@auth/core/providers/credentials'
import { createAuthRoutes } from '@pikku/auth-js'
import type { AuthConfigOrFactory } from '@pikku/auth-js'
import { wireHTTPRoutes } from '../../.pikku/pikku-types.gen.js'
import type { SingletonServices } from '../../.pikku/pikku-types.gen.js'

const configFactory: AuthConfigOrFactory = async (services) => {
  const { todoStore } = services as SingletonServices
  const secret = await services.secrets.getSecret(
    (services.config.secrets as Record<string, string>).AUTH_SECRET!
  )
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
    secret,
    trustHost: true,
    basePath: '/auth',
  }
}

wireHTTPRoutes({ routes: { auth: createAuthRoutes(configFactory) as any } })
