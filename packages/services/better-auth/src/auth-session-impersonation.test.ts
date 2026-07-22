import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  resolveImpersonatedSession,
  type SessionLike,
} from './auth-session-impersonation.js'

const USERS: Record<string, any> = {
  u_admin: { id: 'u_admin' },
  u_guest: { id: 'u_guest' },
}

const GRANTS: Record<string, string[]> = {
  u_admin: ['admin'],
  u_guest: ['reports:read'],
}

const caller = (id: string): SessionLike => ({
  user: USERS[id],
  session: { id: `sess_${id}` },
})

function svc(grants: Record<string, string[]> | null = GRANTS) {
  const logs: { info: string[]; warn: string[] } = { info: [], warn: [] }
  const services: any = {
    logger: {
      info: (m: string) => logs.info.push(m),
      warn: (m: string) => logs.warn.push(m),
    },
  }
  if (grants) {
    services.scopeService = {
      resolveScopes: async (userId: string) => grants[userId] ?? [],
    }
  }
  return { services, logs }
}

const loadUser = async (id: string) => USERS[id] ?? null

describe('resolveImpersonatedSession', () => {
  test('returns null with no header (no impersonation requested)', async () => {
    const { services } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => undefined
    )
    assert.equal(out, null)
  })

  test('returns null (no-op) when the target is the caller itself', async () => {
    const { services } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'u_admin'
    )
    assert.equal(out, null)
  })

  test('default gate: admin:impersonate resolves the target session', async () => {
    const { services, logs } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'u_guest'
    )
    assert.deepEqual(out, { userId: 'u_guest' })
    assert.equal(logs.info.length, 1)
  })

  test('default gate: a caller without the scope is denied (returns null)', async () => {
    const { services } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_guest'),
      { loadUser },
      services,
      () => 'u_admin'
    )
    assert.equal(out, null)
  })

  test('default gate: a narrower grant does not satisfy admin:impersonate', async () => {
    const { services } = svc({ u_admin: ['admin:users:list'] })
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'u_guest'
    )
    assert.equal(out, null)
  })

  test('default gate: an exact admin:impersonate grant is enough', async () => {
    const { services } = svc({ u_guest: ['admin:impersonate'] })
    const out = await resolveImpersonatedSession(
      caller('u_guest'),
      { loadUser },
      services,
      () => 'u_admin'
    )
    assert.deepEqual(out, { userId: 'u_admin' })
  })

  test('default gate: fails closed and warns with no ScopeService', async () => {
    const { services, logs } = svc(null)
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'u_guest'
    )
    assert.equal(out, null)
    assert.equal(logs.warn.length, 1)
    assert.match(logs.warn[0]!, /admin:impersonate/)
  })

  test('an unknown target returns null and warns (not an error)', async () => {
    const { services, logs } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'does_not_exist'
    )
    assert.equal(out, null)
    assert.equal(logs.warn.length, 1)
  })

  test('a custom canImpersonate gate overrides the default', async () => {
    const { services } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_guest'),
      { loadUser, canImpersonate: () => true },
      services,
      () => 'u_admin'
    )
    assert.deepEqual(out, { userId: 'u_admin' })
  })

  test('a custom header name is honored', async () => {
    const { services } = svc()
    const seen: string[] = []
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser, header: 'x-act-as' },
      services,
      (name) => {
        seen.push(name)
        return name === 'x-act-as' ? 'u_guest' : undefined
      }
    )
    assert.deepEqual(out, { userId: 'u_guest' })
    assert.deepEqual(seen, ['x-act-as'])
  })

  test('mapSession shapes the impersonated session from the target user', async () => {
    const { services } = svc()
    const out = await resolveImpersonatedSession(
      caller('u_admin'),
      { loadUser },
      services,
      () => 'u_guest',
      (result) => ({ userId: result.user.id, name: result.user.id })
    )
    assert.deepEqual(out, { userId: 'u_guest', name: 'u_guest' })
  })

  test('loadUser errors propagate (not swallowed)', async () => {
    const { services } = svc()
    await assert.rejects(
      resolveImpersonatedSession(
        caller('u_admin'),
        {
          loadUser: async () => {
            throw new Error('db down')
          },
        },
        services,
        () => 'u_guest'
      ),
      /db down/
    )
  })
})
