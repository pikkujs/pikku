import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthMeta } from './serialize-auth-meta.js'
import type { AuthDefinition } from '@pikku/inspector'

const def = (overrides: Partial<AuthDefinition> = {}): AuthDefinition => ({
  exportName: 'auth',
  sourceFile: '/project/src/auth.ts',
  basePath: '/api/auth',
  hasCredentials: false,
  plugins: [],
  services: { optimized: true, services: ['kysely', 'secrets'] },
  ...overrides,
})

describe('serializeAuthMeta', () => {
  test('enriches known providers with displayName and secretId', () => {
    const meta = serializeAuthMeta(def(), ['github', 'google'])
    assert.deepEqual(meta.providers, [
      { id: 'github', displayName: 'GitHub OAuth', secretId: 'GITHUB_OAUTH' },
      { id: 'google', displayName: 'Google OAuth', secretId: 'GOOGLE_OAUTH' },
    ])
  })

  test('drops unknown providers (e.g. genericOAuth-wired) from the meta', () => {
    const meta = serializeAuthMeta(def(), ['github', 'nonexistent-provider'])
    assert.deepEqual(
      meta.providers.map((p) => p.id),
      ['github']
    )
  })

  test('carries basePath and hasCredentials through', () => {
    const meta = serializeAuthMeta(
      def({ basePath: '/auth', hasCredentials: true }),
      []
    )
    assert.equal(meta.basePath, '/auth')
    assert.equal(meta.hasCredentials, true)
  })

  test('enriches plugins with display names from the registry', () => {
    const meta = serializeAuthMeta(
      def({ plugins: ['bearer', 'twoFactor', 'organization'] }),
      []
    )
    assert.deepEqual(meta.plugins, [
      { id: 'bearer', displayName: 'Bearer' },
      { id: 'twoFactor', displayName: 'Two-Factor' },
      { id: 'organization', displayName: 'Organization' },
    ])
  })

  test('derives a Title Case display name for unknown plugins', () => {
    const meta = serializeAuthMeta(def({ plugins: ['myCustomPlugin'] }), [])
    assert.deepEqual(meta.plugins, [
      { id: 'myCustomPlugin', displayName: 'My Custom Plugin' },
    ])
  })
})
