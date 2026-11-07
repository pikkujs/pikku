import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import { withResolvedScopes } from './auth-session-scopes.js'

const scopeService = (
  scopes: Record<string, string[]>,
  onCall?: (userId: string) => void
) =>
  ({
    resolveScopes: async (userId: string) => {
      onCall?.(userId)
      return scopes[userId] ?? []
    },
  }) as any

const servicesWith = (scopeService?: any) =>
  ({ scopeService }) as unknown as CoreServices

describe('withResolvedScopes', () => {
  test("resolves the session user's scopes", async () => {
    const resolved = await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      servicesWith(scopeService({ u1: ['billing:read'] }))
    )

    assert.deepEqual(resolved.scopes, ['billing:read'])
  })

  test('preserves the rest of the mapped session', async () => {
    const resolved = await withResolvedScopes(
      { userId: 'u1', memberRoles: ['admin'] } as CoreUserSession,
      servicesWith(scopeService({ u1: ['billing:read'] }))
    )

    assert.deepEqual(resolved, {
      userId: 'u1',
      memberRoles: ['admin'],
      scopes: ['billing:read'],
      scopesResolvedAt: resolved.scopesResolvedAt,
    })
    assert.equal(typeof resolved.scopesResolvedAt, 'number')
  })

  test('resolves an empty set for a user with no grants', async () => {
    const resolved = await withResolvedScopes(
      { userId: 'u_nobody' } as CoreUserSession,
      servicesWith(scopeService({}))
    )

    assert.deepEqual(resolved.scopes, [])
  })

  // The escape hatch that answers "a restricted API key must not silently
  // inherit everything its owner can do": mapKey/mapSession setting `scopes`
  // is authoritative, and resolution never widens it back out.
  test('never overrides scopes a caller already set', async () => {
    let called = false
    const resolved = await withResolvedScopes(
      { userId: 'u1', scopes: ['billing:read'] } as CoreUserSession,
      servicesWith(
        scopeService({ u1: ['admin:*', 'billing:read'] }, () => {
          called = true
        })
      )
    )

    assert.deepEqual(resolved.scopes, ['billing:read'])
    assert.equal(called, false, 'an explicit scope set must not be re-resolved')
  })

  test('respects a caller that deliberately granted nothing', async () => {
    const resolved = await withResolvedScopes(
      { userId: 'u1', scopes: [] } as CoreUserSession,
      servicesWith(scopeService({ u1: ['admin:*'] }))
    )

    assert.deepEqual(
      resolved.scopes,
      [],
      'an empty scope set is a deliberate restriction, not an absence'
    )
  })

  test('is inert when no ScopeService is registered', async () => {
    const session = { userId: 'u1' } as CoreUserSession
    const resolved = await withResolvedScopes(session, servicesWith(undefined))

    assert.equal(resolved, session)
    assert.equal(resolved.scopes, undefined)
  })

  test('does not resolve for a session with no userId', async () => {
    let called = false
    const resolved = await withResolvedScopes(
      {} as CoreUserSession,
      servicesWith(scopeService({}, () => (called = true)))
    )

    assert.equal(called, false)
    assert.equal(resolved.scopes, undefined)
  })

  // Fail closed and loud: degrading to an empty scope set would turn a DB
  // outage into a fleet of baffling 403s, and would silently succeed for any
  // function that happens to require no scopes.
  test('propagates a resolution failure', async () => {
    await assert.rejects(
      () =>
        withResolvedScopes(
          { userId: 'u1' } as CoreUserSession,
          {
            scopeService: {
              resolveScopes: async () => {
                throw new Error('db down')
              },
            },
          } as unknown as CoreServices
        ),
      /db down/
    )
  })
})

describe('withResolvedScopes with a scope cache', () => {
  const memoryCache = (ttlSeconds: number, held: any = null) => {
    const written: any[] = []
    return {
      written,
      cache: {
        ttlSeconds,
        read: async () => held,
        write: async (snapshot: any) => {
          written.push(snapshot)
        },
      },
    }
  }

  test('a TTL of zero reads the store on every request', async () => {
    let reads = 0
    const services = servicesWith(scopeService({ u1: ['a'] }, () => reads++))
    const { cache } = memoryCache(0, {
      userId: 'u1',
      scopes: ['a'],
      at: Date.now(),
    })
    await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      services,
      cache
    )
    await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      services,
      cache
    )
    assert.equal(reads, 2)
  })

  test('a fresh snapshot skips the read', async () => {
    let reads = 0
    const at = Date.now() - 1000
    const { cache, written } = memoryCache(60, {
      userId: 'u1',
      scopes: ['cached'],
      at,
    })
    const resolved = await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      servicesWith(scopeService({ u1: ['fresh'] }, () => reads++)),
      cache
    )
    assert.equal(reads, 0)
    assert.deepEqual(resolved.scopes, ['cached'])
    assert.equal(resolved.scopesResolvedAt, at)
    assert.equal(written.length, 0)
  })

  test('a stale snapshot re-reads and re-stamps', async () => {
    const { cache, written } = memoryCache(60, {
      userId: 'u1',
      scopes: ['old'],
      at: Date.now() - 61_000,
    })
    const resolved = await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      servicesWith(scopeService({ u1: ['new'] })),
      cache
    )
    assert.deepEqual(resolved.scopes, ['new'])
    assert.equal(written.length, 1)
    assert.equal(written[0].at, resolved.scopesResolvedAt)
  })

  test("another user's snapshot is never trusted", async () => {
    const { cache } = memoryCache(60, {
      userId: 'u2',
      scopes: ['theirs'],
      at: Date.now(),
    })
    const resolved = await withResolvedScopes(
      { userId: 'u1' } as CoreUserSession,
      servicesWith(scopeService({ u1: ['mine'] })),
      cache
    )
    assert.deepEqual(resolved.scopes, ['mine'])
  })

  test('mapSession scopes stay untouched even with a stale-looking cache', async () => {
    let reads = 0
    const { cache, written } = memoryCache(60, {
      userId: 'u1',
      scopes: ['x'],
      at: 0,
    })
    const resolved = await withResolvedScopes(
      { userId: 'u1', scopes: [] } as CoreUserSession,
      servicesWith(scopeService({ u1: ['admin'] }, () => reads++)),
      cache
    )
    assert.deepEqual(resolved.scopes, [])
    assert.equal(reads, 0)
    assert.equal(written.length, 0)
  })
})
