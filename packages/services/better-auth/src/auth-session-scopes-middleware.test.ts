import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuthSession } from './auth-session.js'

const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'

const USERS: Record<string, any> = {
  u_admin: { id: 'u_admin', role: 'admin' },
  u_guest: { id: 'u_guest', role: 'user' },
}

const GRANTS: Record<string, string[]> = {
  u_admin: ['admin:*'],
  u_guest: ['billing:read'],
}

/**
 * Drives the middleware end to end so each path that reaches `setSession` is
 * exercised through the real code, not a stub.
 */
async function run(opts: {
  caller?: any
  apiKeyHeader?: string
  impersonateHeader?: string
  verifiedKey?: any
  mapKey?: (key: any) => any
  mapSession?: (result: any) => any
  withScopeService?: boolean
}) {
  const captured: any[] = []
  const services: any = {
    logger: { info() {}, warn() {}, error() {} },
    auth: async () => ({
      api: {
        getSession: async () =>
          opts.caller
            ? { user: opts.caller, session: { id: `sess_${opts.caller.id}` } }
            : null,
        verifyApiKey: async () =>
          opts.verifiedKey
            ? { valid: true, error: null, key: opts.verifiedKey }
            : { valid: false, error: 'nope', key: null },
      },
    }),
  }
  if (opts.withScopeService !== false) {
    services.scopeService = {
      resolveScopes: async (userId: string) => GRANTS[userId] ?? [],
    }
  }

  const headers: Record<string, string | undefined> = {
    'x-api-key': opts.apiKeyHeader,
    [IMPERSONATE_HEADER]: opts.impersonateHeader,
  }
  const wire: any = {
    http: {
      request: {
        header: (name: string) => headers[name],
        headers: () => ({}),
      },
    },
    setSession: (s: any) => captured.push(s),
    session: undefined,
  }

  const mw = betterAuthSession({
    ...(opts.mapSession ? { mapSession: opts.mapSession } : {}),
    ...(opts.mapKey ? { apiKey: { mapKey: opts.mapKey } } : {}),
    impersonation: {
      loadUser: async (userId: string) => USERS[userId] ?? null,
    },
  })
  await mw(services, wire, async () => {})
  return captured[0] ?? null
}

describe('betterAuthSession scopes — human path', () => {
  test('resolves scopes onto the default session', async () => {
    const session = await run({ caller: USERS.u_guest })
    assert.deepEqual(session.scopes, ['billing:read'])
  })

  test('resolves scopes onto a mapped session', async () => {
    const session = await run({
      caller: USERS.u_guest,
      mapSession: (result) => ({ userId: result.user.id, tier: 'pro' }),
    })

    assert.equal(session.tier, 'pro')
    assert.deepEqual(session.scopes, ['billing:read'])
  })

  test('a mapSession that sets scopes wins', async () => {
    const session = await run({
      caller: USERS.u_admin,
      mapSession: (result) => ({ userId: result.user.id, scopes: ['billing'] }),
    })

    assert.deepEqual(session.scopes, ['billing'])
  })

  test('sets no scopes when no ScopeService is registered', async () => {
    const session = await run({
      caller: USERS.u_guest,
      withScopeService: false,
    })
    assert.equal(session.scopes, undefined)
  })
})

describe('betterAuthSession scopes — impersonation', () => {
  // The whole point of impersonation is to run *as* the target. Inheriting the
  // admin's scopes would let a support session act with admin rights while
  // appearing to be the user.
  test("an impersonated session carries the target's scopes", async () => {
    const session = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'u_guest',
    })

    assert.equal(session.userId, 'u_guest')
    assert.deepEqual(session.scopes, ['billing:read'])
  })

  test("a denied impersonation keeps the real caller's scopes", async () => {
    const session = await run({
      caller: USERS.u_guest,
      impersonateHeader: 'u_admin',
    })

    assert.equal(session.userId, 'u_guest')
    assert.deepEqual(session.scopes, ['billing:read'])
  })
})

describe('betterAuthSession scopes — machine path', () => {
  test('resolves scopes for an API key acting as its owner', async () => {
    const session = await run({
      apiKeyHeader: 'raw-key',
      verifiedKey: { userId: 'u_guest' },
      mapKey: (key) => ({ userId: key.userId }),
    })

    assert.deepEqual(session.scopes, ['billing:read'])
  })

  // The subtlety this feature has to get right: a key minted with a narrow
  // scope must not silently inherit everything its owner can do.
  test("a restricted key does not inherit its owner's scopes", async () => {
    const session = await run({
      apiKeyHeader: 'raw-key',
      verifiedKey: { userId: 'u_admin', scopes: ['billing:read'] },
      mapKey: (key) => ({ userId: key.userId, scopes: key.scopes }),
    })

    assert.deepEqual(
      session.scopes,
      ['billing:read'],
      'the key was minted narrow; resolution must not widen it to admin:*'
    )
  })

  test('a key scoped to nothing stays scoped to nothing', async () => {
    const session = await run({
      apiKeyHeader: 'raw-key',
      verifiedKey: { userId: 'u_admin' },
      mapKey: (key) => ({ userId: key.userId, scopes: [] }),
    })

    assert.deepEqual(session.scopes, [])
  })
})
