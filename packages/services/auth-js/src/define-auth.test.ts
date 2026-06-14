import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineAuth } from './define-auth.js'

describe('defineAuth', () => {
  test('returns a config with no side effects (pure)', () => {
    const result = defineAuth({ providers: ['github'] })
    assert.equal(typeof result.configFactory, 'function')
    assert.equal(result.basePath, '/auth')
    assert.equal(result.hasCredentials, false)
  })

  test('exposes provider display metadata for known providers', () => {
    const { providers } = defineAuth({ providers: ['github', 'google'] })
    assert.deepEqual(
      providers.map((p) => p.id),
      ['github', 'google']
    )
    for (const p of providers) {
      assert.ok(p.displayName, 'displayName is populated')
      assert.ok(p.secretId, 'secretId is populated')
    }
  })

  test('drops unknown providers from the display metadata', () => {
    const { providers } = defineAuth({ providers: ['github', 'nope' as any] })
    assert.deepEqual(
      providers.map((p) => p.id),
      ['github']
    )
  })

  test('honours a custom basePath', () => {
    assert.equal(defineAuth({ basePath: '/api/auth' }).basePath, '/api/auth')
  })

  test('flags credentials auth', () => {
    const result = defineAuth({
      credentials: { authorize: () => async () => null },
    })
    assert.equal(result.hasCredentials, true)
    assert.deepEqual(result.providers, [])
  })

  test('credentials-only auth still returns a usable configFactory', () => {
    const result = defineAuth({
      credentials: { authorize: () => async () => null },
    })
    assert.equal(typeof result.configFactory, 'function')
  })
})
