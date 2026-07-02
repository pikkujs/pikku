import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { actor } from './actor-plugin.js'
import { stampActorFlag } from './stamp-actor-flag.js'

const makeAuth = (db: Record<string, any[]>, secret?: string) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [actor({ secret })],
  })

const signInActor = (
  auth: ReturnType<typeof makeAuth>,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/actor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('better-auth actor plugin', () => {
  test('auto-creates the actor user and mints a session cookie', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, 'flow-secret')

    const res = await signInActor(auth, {
      email: 'Customer@Actors.local',
      name: 'Customer',
      secret: 'flow-secret',
    })

    assert.equal(res.status, 200)
    const setCookie = res.headers.getSetCookie().join('; ')
    assert.match(setCookie, /better-auth\.session_token=/)

    const body = await res.json()
    assert.equal(body.user.email, 'customer@actors.local')
    assert.equal(body.user.actor, true)

    const row = db.user!.find((u) => u.email === 'customer@actors.local')
    assert.equal(row?.actor, true, 'user row is flagged actor')
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row
    const res2 = await signInActor(auth, {
      email: 'customer@actors.local',
      secret: 'flow-secret',
    })
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate actor rows')
  })

  test('refuses to impersonate a real (non-actor) user even with the secret', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u1',
          email: 'real@person.com',
          name: 'Real',
          emailVerified: true,
          actor: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const auth = makeAuth(db, 'flow-secret')

    const res = await signInActor(auth, {
      email: 'real@person.com',
      secret: 'flow-secret',
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not an actor/)
  })

  test('rejects a wrong secret and an unconfigured plugin', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const wrong = await signInActor(makeAuth(db, 'flow-secret'), {
      email: 'a@b.c',
      secret: 'nope',
    })
    assert.equal(wrong.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad secret')

    const unconfigured = await signInActor(makeAuth(db, undefined), {
      email: 'a@b.c',
      secret: '',
    })
    assert.equal(unconfigured.status, 401)
  })
})

describe('stampActorFlag', () => {
  test('stamps actor users, leaves real users and explicit values alone', () => {
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, { actor: true }), {
      userId: 'u1',
      actor: true,
    })
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, { actor: false }), {
      userId: 'u1',
    })
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, undefined), {
      userId: 'u1',
    })
    // A mapSession that explicitly set actor wins
    assert.deepEqual(
      stampActorFlag({ userId: 'u1', actor: false }, { actor: true }),
      { userId: 'u1', actor: false }
    )
  })
})
