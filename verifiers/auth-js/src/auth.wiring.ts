import { addHTTPMiddleware } from '@pikku/core/http'
import { wireAuth, authJsSession } from '@pikku/auth-js'
import { createUser, lookupUser } from './user-store.js'

wireAuth({
  providers: [
    'github',
    'google',
    'discord',
    'twitter',
    'apple',
    'facebook',
    'linkedin',
    'slack',
    'spotify',
    'twitch',
    'gitlab',
    'reddit',
    'notion',
    'instagram',
    'zoom',
    'tiktok',
    'threads',
    'patreon',
    'dropbox',
    'hubspot',
    'salesforce',
    'atlassian',
    'strava',
    'auth0',
    'okta',
    'microsoft-entra-id',
    'keycloak',
    'cognito',
  ],
  credentials: {
    fields: {
      email: { label: 'Email', type: 'email', required: true },
      password: { label: 'Password', type: 'password', required: true },
      mode: { label: 'Mode', type: 'text' },
    },
    authorize: async (_rpc, credentials) => {
      const email = credentials.email as string
      const password = credentials.password as string
      const mode = credentials.mode as string | undefined

      if (!email || !password) return null

      if (mode === 'signup') {
        try {
          const user = createUser(email, password)
          return { id: user.id, email: user.email, name: user.email }
        } catch {
          return null
        }
      }

      const user = lookupUser(email, password)
      if (!user) return null
      return { id: user.id, email: user.email, name: user.email }
    },
  },
})

addHTTPMiddleware('*', [
  authJsSession({
    secretId: 'AUTH_SECRET',
    mapSession: (claims) => ({ userId: claims.sub as string }),
  }),
])
