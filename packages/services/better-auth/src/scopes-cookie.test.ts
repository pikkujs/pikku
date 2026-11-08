import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  MAX_COOKIE_VALUE_LENGTH,
  SCOPES_COOKIE,
  scopesCookieCache,
  signScopeSnapshot,
  verifyScopeSnapshot,
} from './scopes-cookie.js'

const snapshot = { userId: 'u1', scopes: ['a:b'], at: 1000 }

describe('scope snapshot cookie', () => {
  test('round-trips a signed snapshot', async () => {
    const value = await signScopeSnapshot(snapshot, 's3cret')
    assert.deepEqual(await verifyScopeSnapshot(value, 's3cret'), snapshot)
  })

  test('rejects a wrong secret, a tampered payload and junk', async () => {
    const value = await signScopeSnapshot(snapshot, 's3cret')
    assert.equal(await verifyScopeSnapshot(value, 'other'), null)
    const [, sig] = value.split('.')
    const forged = btoa(JSON.stringify({ ...snapshot, scopes: ['admin:*'] }))
    assert.equal(await verifyScopeSnapshot(`${forged}.${sig}`, 's3cret'), null)
    assert.equal(await verifyScopeSnapshot('junk', 's3cret'), null)
    assert.equal(await verifyScopeSnapshot(undefined, 's3cret'), null)
  })

  test('is absent at TTL zero, without a secret, or without a response', () => {
    const response = { cookie: () => undefined }
    const base = { cookieHeader: null, response }
    assert.equal(
      scopesCookieCache({ ...base, ttlSeconds: 0, secret: 's' }),
      undefined
    )
    assert.equal(
      scopesCookieCache({ ...base, ttlSeconds: 5, secret: undefined }),
      undefined
    )
    assert.equal(
      scopesCookieCache({
        ttlSeconds: 5,
        secret: 's',
        cookieHeader: null,
        response: undefined,
      }),
      undefined
    )
  })

  test('writes the cookie and reads it back from the request header', async () => {
    const sets: any[] = []
    const cache = scopesCookieCache({
      ttlSeconds: 30,
      secret: 's',
      cookieHeader: null,
      response: { cookie: (...args) => sets.push(args) },
    })!
    await cache.write(snapshot)
    assert.equal(sets[0][0], SCOPES_COOKIE)
    assert.equal(sets[0][2].maxAge, 30)
    const reader = scopesCookieCache({
      ttlSeconds: 30,
      secret: 's',
      cookieHeader: `${SCOPES_COOKIE}=${sets[0][1]}`,
      response: { cookie: () => undefined },
    })!
    assert.deepEqual(await reader.read(), snapshot)
  })

  test('rejects correctly signed snapshots whose fields are invalid', async () => {
    for (const bad of [
      { ...snapshot, userId: 7 },
      { ...snapshot, at: 'now' },
      { ...snapshot, scopes: ['a:b', 3] },
      { ...snapshot, scopes: 'a:b' },
      { userId: 'u1', at: 1000 },
    ]) {
      const value = await signScopeSnapshot(bad as any, 's3cret')
      assert.equal(await verifyScopeSnapshot(value, 's3cret'), null)
    }
  })

  test('does not read the secret until the cache is used', async () => {
    let reads = 0
    const cache = scopesCookieCache({
      ttlSeconds: 30,
      secret: async () => {
        reads++
        return 's'
      },
      cookieHeader: null,
      response: { cookie: () => undefined },
    })!
    assert.equal(reads, 0)
    await cache.read()
    await cache.write(snapshot)
    assert.equal(reads, 1)
  })

  test('skips the cookie when the snapshot would not fit in one', async () => {
    const sets: any[] = []
    const cache = scopesCookieCache({
      ttlSeconds: 30,
      secret: 's',
      cookieHeader: null,
      response: { cookie: (...args) => sets.push(args) },
    })!
    const big = {
      ...snapshot,
      scopes: Array.from({ length: 400 }, (_, i) => `area:resource-${i}:read`),
    }
    assert.ok(
      (await signScopeSnapshot(big, 's')).length > MAX_COOKIE_VALUE_LENGTH
    )
    await cache.write(big)
    assert.equal(sets.length, 0)
  })
})
