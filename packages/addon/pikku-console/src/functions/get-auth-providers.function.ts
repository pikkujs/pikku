import { getAuthRegistry } from '@pikku/core'
import { pikkuSessionlessFunc } from '#pikku'

export interface AuthProviderEntry {
  id: string
  displayName: string
  secretId: string
}

export interface AuthProvidersMeta {
  providers: AuthProviderEntry[]
  hasCredentials: boolean
}

export const getAuthProviders = pikkuSessionlessFunc<null, AuthProvidersMeta>({
  title: 'Get Auth Providers',
  description:
    'Returns the auth providers configured via pikkuBetterAuth(), enriched with display metadata.',
  expose: true,
  auth: false,
  func: async () => {
    // pikkuBetterAuth() writes into the module-level registry at eval time.
    // auth.gen.ts imports the user's auth file (which calls pikkuBetterAuth) before
    // any request is handled, so the registry is always populated by the time
    // this function runs.
    return getAuthRegistry()
  },
})
