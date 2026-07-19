import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { CoreServices, CoreUserSession } from '@pikku/core'
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
    })
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
