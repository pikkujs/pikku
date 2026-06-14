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
    'Returns the auth providers configured via defineAuth(), enriched with display metadata.',
  expose: true,
  auth: false,
  func: async () => {
    // Auth provider metadata now lives on the project's exported `defineAuth`
    // config (`auth.providers` / `auth.hasCredentials`). pikku-console cannot
    // import that user-owned const, and a runtime registry would not survive a
    // per-unit deploy (each worker is its own process), so this returns empty
    // until the console reads provider metadata from the deploy manifest.
    return { providers: [], hasCredentials: false }
  },
})
