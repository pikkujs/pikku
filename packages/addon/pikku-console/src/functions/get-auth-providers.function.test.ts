import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAuthProviders } from './get-auth-providers.function.js'
import type { AuthProvidersMeta } from './get-auth-providers.function.js'

const META = {
  basePath: '/api/auth',
  hasCredentials: true,
  providers: [
    { id: 'github', displayName: 'GitHub OAuth', secretId: 'GITHUB_OAUTH' },
  ],
  plugins: [{ id: 'bearer', displayName: 'Bearer' }],
}

const metaServiceReturning = (content: string | null) =>
  ({
    readFile: async (relativePath: string) => {
      assert.equal(relativePath, 'auth/pikku-auth-meta.gen.json')
      return content
    },
  }) as never

test('getAuthProviders returns providers, plugins, and hasCredentials from the meta file', async () => {
  const result = (await getAuthProviders.func(
    { metaService: metaServiceReturning(JSON.stringify(META)) } as never,
    null as never,
    {} as never
  )) as AuthProvidersMeta
  assert.deepEqual(result.providers, META.providers)
  assert.deepEqual(result.plugins, META.plugins)
  assert.equal(result.hasCredentials, true)
})

test('getAuthProviders returns an empty result when the meta file is absent', async () => {
  const result = (await getAuthProviders.func(
    { metaService: metaServiceReturning(null) } as never,
    null as never,
    {} as never
  )) as AuthProvidersMeta
  assert.deepEqual(result, {
    providers: [],
    plugins: [],
    hasCredentials: false,
  })
})
