import Credentials from '@auth/core/providers/credentials'
import { createAuthRoutes } from '@pikku/auth-js'
import type { AuthConfigOrFactory } from '@pikku/auth-js'
import { wireHTTPRoutes } from '../../.pikku/pikku-types.gen.js'

const configFactory: AuthConfigOrFactory = async (services) => {
  const secret = await services.secrets.getSecret(
    (services.config.secrets as Record<string, string>).AUTH_SECRET!
  )
  return {
    providers: [
      Credentials({
        credentials: { username: {}, password: {} },
        authorize: async (credentials) => {
          if (credentials.username === 'admin' && credentials.password === 'password') {
            return { id: '1', name: 'Admin', email: 'admin@example.com' }
          }
          return null
        },
      }),
    ],
    secret,
    trustHost: true,
    basePath: '/auth',
  }
}

wireHTTPRoutes({ routes: { auth: createAuthRoutes(configFactory) as any } })
