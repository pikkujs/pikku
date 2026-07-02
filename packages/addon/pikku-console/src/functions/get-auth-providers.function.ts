import { pikkuFunc } from '#pikku'
import type { MetaService } from '@pikku/core/services'

export interface AuthProviderEntry {
  id: string
  displayName: string
  secretId: string
}

export interface AuthPluginEntry {
  id: string
  displayName: string
}

export interface AuthProvidersMeta {
  providers: AuthProviderEntry[]
  plugins: AuthPluginEntry[]
  hasCredentials: boolean
}

const EMPTY_META: AuthProvidersMeta = {
  providers: [],
  plugins: [],
  hasCredentials: false,
}

async function readAuthMeta(
  metaService: MetaService
): Promise<AuthProvidersMeta> {
  try {
    const content = await metaService.readFile('auth/pikku-auth-meta.gen.json')
    if (!content) return EMPTY_META
    const parsed = JSON.parse(content)
    return {
      providers: parsed.providers ?? [],
      plugins: parsed.plugins ?? [],
      hasCredentials: parsed.hasCredentials ?? false,
    }
  } catch {
    return EMPTY_META
  }
}

export const getAuthProviders = pikkuFunc<null, AuthProvidersMeta>({
  title: 'Get Auth Providers',
  description:
    'Returns the social providers and plugins configured via pikkuBetterAuth(), read from the generated auth-meta.gen.json.',
  expose: true,
  func: async ({ metaService }) => readAuthMeta(metaService),
})
