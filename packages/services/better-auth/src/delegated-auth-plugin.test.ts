import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { fabric } from './fabric-plugin.js'
import {
  delegatedAuth,
  DELEGATED_PROVIDER_ID,
  type DelegatedAuthOptions,
  type UpstreamIdentity,
} from './delegated-auth-plugin.js'

const identityFor = (
  over: Partial<UpstreamIdentity> = {}
): UpstreamIdentity => ({
  externalId: 'bb2-1',
  email: 'Jane@Corp.com',
  name: 'Jane Doe',
  role: 'Manager',
  credential: { token: 'jwt-1', expiresAt: 4102444800 },
  ...over,
})

const makeAuth = (
  db: Record<string, any[]>,
  opts: Partial<DelegatedAuthOptions> = {}
) => {
  const stored: Array<{ userId: string; identity: UpstreamIdentity }> = []
  // Stands in for the app's ScopeService: roles are pikku grants, not a column.
  const roles: Array<{ userId: string; role: string }> = []
  const scopeService = {
    listUserRoles: async (userId: string) =>
      roles.filter((r) => r.userId === userId).map((r) => r.role),
    addUserToRole: async (userId: string, role: string) => {
      roles.push({ userId, role })
    },
  } as any
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [
      // fabric() declares the `fabric` flag the plugin refuses to sign in.
      fabric({ publicKey: undefined }),
      delegatedAuth({
        scopeService,
        authenticate: async ({ email, password, apiKey }) => {
          if (apiKey === 'good-key') return identityFor()
          if (email === 'jane@corp.com' && password === 'hunter2') {
            return identityFor()
          }
          return null
        },
        storeCredential: async (userId, identity) => {
          stored.push({ userId, identity })
        },
        ...opts,
      }),
    ],
  })
  return { auth, stored, roles }
}

const signInDelegated = (
  auth: ReturnType<typeof betterAuth>,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/delegated', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('better-auth delegatedAuth plugin', () => {
  test('JIT-provisions the user, links the delegated account, stores the credential, mints a session', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth, stored, roles } = makeAuth(db)

    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 200)
    assert.match(
      res.headers.getSetCookie().join('; '),
      /better-auth\.session_token=/
    )

    const body = await res.json()
    assert.equal(body.user.email, 'jane@corp.com')

    const row = db.user!.find((u) => u.email === 'jane@corp.com')
    assert.ok(row, 'user row created')
    assert.equal(row.emailVerified, true)
    assert.equal(row.name, 'Jane Doe')
    assert.deepEqual(roles, [{ userId: row.id, role: 'Manager' }])

    const account = db.account!.find(
      (a) => a.providerId === DELEGATED_PROVIDER_ID
    )
    assert.ok(account, 'delegated account row created')
    assert.equal(account.accountId, 'bb2-1')
    assert.equal(account.userId, row.id)

    assert.equal(stored.length, 1)
    assert.equal(stored[0]!.userId, row.id)
    assert.deepEqual(stored[0]!.identity.credential, {
      token: 'jwt-1',
      expiresAt: 4102444800,
    })
  })

  test('second sign-in resolves via the account row and refreshes name/role', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth, roles } = makeAuth(db, {
      authenticate: async ({ password }) =>
        password === 'hunter2'
          ? identityFor()
          : password === 'hunter2-later'
            ? identityFor({ name: 'Jane Married', role: 'Admin' })
            : null,
    })

    assert.equal(
      (
        await signInDelegated(auth, {
          email: 'jane@corp.com',
          password: 'hunter2',
        })
      ).status,
      200
    )
    const res2 = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2-later',
    })
    assert.equal(res2.status, 200)

    assert.equal(db.user!.length, 1, 'no duplicate rows')
    assert.equal(db.account!.length, 1, 'no duplicate account rows')
    assert.equal(db.user![0]!.name, 'Jane Married')
    assert.deepEqual(roles, [
      { userId: db.user![0]!.id, role: 'Manager' },
      { userId: db.user![0]!.id, role: 'Admin' },
    ])
  })

  test('links a delegated account to an existing email row without one', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u-existing',
          email: 'jane@corp.com',
          name: 'Old Name',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const { auth, stored } = makeAuth(db)

    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 200)
    assert.equal(db.user!.length, 1)
    assert.equal(db.user![0]!.name, 'Jane Doe', 'name refreshed')
    const account = db.account!.find(
      (a) => a.providerId === DELEGATED_PROVIDER_ID
    )
    assert.equal(account?.userId, 'u-existing')
    assert.equal(stored[0]!.userId, 'u-existing')
  })

  test('refuses an email row already linked to a DIFFERENT upstream user', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u1',
          email: 'jane@corp.com',
          name: 'Jane',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [
        {
          id: 'a1',
          providerId: DELEGATED_PROVIDER_ID,
          accountId: 'bb2-OTHER',
          userId: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    }
    const { auth, stored } = makeAuth(db)

    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /different upstream user/)
    assert.equal(stored.length, 0)
    assert.equal(db.session!.length, 0)
  })

  test('refuses synthetic fabric/actor rows', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u-fab',
          email: 'jane@corp.com',
          name: 'Fabric',
          emailVerified: true,
          fabric: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const { auth } = makeAuth(db)
    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 401)
  })

  test('storeCredential failure fails the sign-in before any session exists', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth } = makeAuth(db, {
      storeCredential: async () => {
        throw new Error('vault down')
      },
    })
    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 500)
    assert.equal(db.session!.length, 0, 'no session minted')
  })

  test('rejects bad upstream credentials and a throwing authenticate without leaking detail', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth, stored } = makeAuth(db)

    const bad = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'wrong',
    })
    assert.equal(bad.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad credentials')
    assert.equal(stored.length, 0)

    const { auth: throwing } = makeAuth(db, {
      authenticate: async () => {
        throw new Error('ECONNREFUSED upstream.internal:443')
      },
    })
    const res = await signInDelegated(throwing, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 401)
    assert.doesNotMatch(
      JSON.stringify(await res.json()),
      /ECONNREFUSED|upstream\.internal/,
      'upstream error detail must not leak'
    )
  })

  test('apiKey mode signs in without email/password; missing fields are a 400', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth } = makeAuth(db)

    const res = await signInDelegated(auth, { apiKey: 'good-key' })
    assert.equal(res.status, 200)
    assert.equal(db.user!.length, 1)

    const missing = await signInDelegated(auth, { email: 'jane@corp.com' })
    assert.equal(missing.status, 400)
  })

  test('mapRole and defaultRole shape the granted role', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth, roles } = makeAuth(db, {
      mapRole: (r) => (r === 'Manager' ? 'admin' : 'user'),
    })
    await signInDelegated(auth, { email: 'jane@corp.com', password: 'hunter2' })
    assert.deepEqual(roles, [{ userId: db.user![0]!.id, role: 'admin' }])

    const db2: Record<string, any[]> = { user: [], session: [], account: [] }
    const { auth: auth2, roles: roles2 } = makeAuth(db2, {
      authenticate: async () => identityFor({ role: undefined }),
      defaultRole: 'user',
    })
    await signInDelegated(auth2, { email: 'x@y.z', password: 'p' })
    assert.deepEqual(roles2, [{ userId: db2.user![0]!.id, role: 'user' }])
  })

  test('a sign-in with no ScopeService still succeeds, dropping the role', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const warnings: string[] = []
    const { auth } = makeAuth(db, {
      scopeService: undefined,
      logger: { warn: (m: string) => warnings.push(m) } as any,
    })
    const res = await signInDelegated(auth, {
      email: 'jane@corp.com',
      password: 'hunter2',
    })
    assert.equal(res.status, 200)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /no ScopeService/)
  })
})
