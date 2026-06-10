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
    'Returns the auth providers configured via wireAuth(), enriched with display metadata.',
  expose: true,
  auth: false,
  func: async () => {
    try {
      const authJs = await import('@pikku/auth-js' as string)
      const meta = authJs.getWiredAuthMeta?.()
      if (!meta) {
        return { providers: [], hasCredentials: false }
      }
      return {
        providers: (meta.providers ?? []).map((p: any) => ({
          id: p.id,
          displayName: p.displayName,
          secretId: p.secretId,
        })),
        hasCredentials: Boolean(meta.hasCredentials),
      }
    } catch {
      return { providers: [], hasCredentials: false }
    }
  },
})
