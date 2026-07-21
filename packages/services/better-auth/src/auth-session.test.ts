import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuthSession } from './auth-session.js'

const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'

const USERS: Record<string, any> = {
  u_admin: { id: 'u_admin', memberRoles: ['admin'] },
  u_guest: { id: 'u_guest', memberRoles: [] },
}

/** Grants each user holds, as the registered ScopeService resolves them. */
const GRANTS: Record<string, string[]> = {
  u_admin: ['admin'],
  u_guest: [],
}

const mapSession = (result: any) => ({
  userId: result.user.id,
  memberRoles: result.user.memberRoles,
})

async function run(opts: {
  caller: any | null
  impersonateHeader?: string
  withImpersonation?: boolean
  canImpersonate?: (result: any) => boolean | Promise<boolean>
}) {
  const captured: any[] = []
  let warned = false
  const services: any = {
    logger: {
      info() {},
      warn() {
        warned = true
      },
    },
    scopeService: {
      resolveScopes: async (userId: string) => GRANTS[userId] ?? [],
    },
    auth: async () => ({
      api: {
        getSession: async () =>
          opts.caller
            ? { user: opts.caller, session: { id: `sess_${opts.caller.id}` } }
            : null,
      },
    }),
  }
  const wire: any = {
    http: {
      request: {
        header: (name: string) =>
          name === IMPERSONATE_HEADER ? opts.impersonateHeader : undefined,
        headers: () => ({}),
      },
    },
    setSession: (s: any) => captured.push(s),
    session: undefined,
  }
  const mw = betterAuthSession({
    mapSession,
    ...(opts.withImpersonation === false
      ? {}
      : {
          impersonation: {
            ...(opts.canImpersonate
              ? {
                  canImpersonate: (result: any) => opts.canImpersonate!(result),
                }
              : {}),
            loadUser: async (userId: string) => USERS[userId] ?? null,
          },
        }),
  })
  await mw(services, wire, async () => {})
  return { session: captured[0] ?? null, warned }
}

describe('betterAuthSession impersonation', () => {
  test('admin with no header runs as the admin', async () => {
    const { session } = await run({ caller: USERS.u_admin })
    assert.deepEqual(session, { userId: 'u_admin', memberRoles: ['admin'], scopes: ['admin'] })
  })

  test('admin with the header runs as the target user', async () => {
    const { session } = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'u_guest',
    })
    assert.deepEqual(session, { userId: 'u_guest', memberRoles: [], scopes: [] })
  })

  test('non-admin cannot escalate via a forged header', async () => {
    const { session } = await run({
      caller: USERS.u_guest,
      impersonateHeader: 'u_admin',
    })
    assert.deepEqual(session, { userId: 'u_guest', memberRoles: [], scopes: [] })
  })

  test('an unknown target falls back to the real caller and warns', async () => {
    const { session, warned } = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'does_not_exist',
    })
    assert.deepEqual(session, { userId: 'u_admin', memberRoles: ['admin'], scopes: ['admin'] })
    assert.equal(warned, true)
  })

  test('impersonating your own id is a no-op', async () => {
    const { session } = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'u_admin',
    })
    assert.deepEqual(session, { userId: 'u_admin', memberRoles: ['admin'], scopes: ['admin'] })
  })

  test('the header is inert when impersonation is not configured', async () => {
    const { session } = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'u_guest',
      withImpersonation: false,
    })
    assert.deepEqual(session, { userId: 'u_admin', memberRoles: ['admin'], scopes: ['admin'] })
  })

  test('a custom canImpersonate gate is honored', async () => {
    const denyAll = await run({
      caller: USERS.u_admin,
      impersonateHeader: 'u_guest',
      canImpersonate: () => false,
    })
    assert.deepEqual(denyAll.session, {
      userId: 'u_admin',
      memberRoles: ['admin'],
      scopes: ['admin'],
    })

    const allowGuest = await run({
      caller: USERS.u_guest,
      impersonateHeader: 'u_admin',
      canImpersonate: () => true,
    })
    assert.deepEqual(allowGuest.session, {
      userId: 'u_admin',
      memberRoles: ['admin'],
      scopes: ['admin'],
    })
  })

  test('no session is set when the caller is unauthenticated', async () => {
    const { session } = await run({
      caller: null,
      impersonateHeader: 'u_admin',
    })
    assert.equal(session, null)
  })
})
