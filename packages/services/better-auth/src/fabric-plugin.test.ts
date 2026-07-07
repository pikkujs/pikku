import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { fabric } from './fabric-plugin.js'

const makeAuth = (db: Record<string, any[]>, secret?: string) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    // admin() declares the `role` column the fabric row is created with.
    plugins: [fabric({ secret }), admin()],
  })

const signInFabric = (
  auth: ReturnType<typeof makeAuth>,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/fabric', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('better-auth fabric plugin', () => {
  test('mints an admin session for a synthetic fabric operator row', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, 'stage-secret')

    const res = await signInFabric(auth, {
      fabricUserId: 'op-123',
      name: 'Yasser',
      secret: 'stage-secret',
    })

    assert.equal(res.status, 200)
    assert.match(res.headers.getSetCookie().join('; '), /better-auth\.session_token=/)

    const body = await res.json()
    assert.equal(body.user.fabric, true)

    const row = db.user!.find((u) => u.id === body.user.id)
    assert.equal(row?.fabric, true, 'user row is flagged fabric')
    assert.equal(row?.role, 'admin', 'fabric row is app-admin')
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row — no duplicate operators.
    const res2 = await signInFabric(auth, { fabricUserId: 'op-123', secret: 'stage-secret' })
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate fabric rows')
  })

  test('never signs in a real user sitting at the namespaced email', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'real',
          email: 'fabric-op-1@fabric.internal',
          name: 'Real',
          emailVerified: true,
          fabric: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const res = await signInFabric(makeAuth(db, 'stage-secret'), {
      fabricUserId: 'op-1',
      secret: 'stage-secret',
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not a fabric operator/)
  })

  test('rejects a wrong secret and an unconfigured plugin', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const wrong = await signInFabric(makeAuth(db, 'stage-secret'), {
      fabricUserId: 'op-9',
      secret: 'nope',
    })
    assert.equal(wrong.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad secret')

    const unconfigured = await signInFabric(makeAuth(db, undefined), {
      fabricUserId: 'op-9',
      secret: '',
    })
    assert.equal(unconfigured.status, 401)
  })
})
