import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { hasScopes } from '@pikku/core/scope'

import { pikkuFabric } from './fabric-plugin.js'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
// A second, unrelated keypair — tokens it signs must be rejected.
const other = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const b64url = (input: Buffer | string): string =>
  (typeof input === 'string' ? Buffer.from(input) : input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const signToken = (
  signingKey: string,
  claims: Record<string, unknown>
): string => {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'test',
    iat: now,
    exp: now + 120,
    purpose: 'fabric-admin',
    ...claims,
  }
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`
  const sig = b64url(createSign('RSA-SHA256').update(input).sign(signingKey))
  return `${input}.${sig}`
}

const makeScopeService = (declared: string[] = ['virtualUser']) => {
  const granted: Array<{ userId: string; scope: string }> = []
  return {
    granted,
    scopeService: {
      addScopeToUser: async (userId: string, scope: string) => {
        granted.push({ userId, scope })
      },
      listUserScopes: async (userId: string) =>
        granted.filter((g) => g.userId === userId).map((g) => g.scope),
      listScopes: async () =>
        declared.map((id) => ({ id, declared: true as const })),
    } as any,
  }
}

const makeAuth = (
  db: Record<string, any[]>,
  key?: string,
  scopeService?: any,
  audience?: string
) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [pikkuFabric({ publicKey: key, scopeService, audience })],
  })

const signInFabric = (auth: ReturnType<typeof makeAuth>, token: string) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/fabric', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  )

describe('better-auth fabric plugin', () => {
  test('a stage-scoped token only works on the stage it names', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const token = signToken(privateKey, { sub: 'op-1', aud: 'stage-a' })

    const wrongStage = await signInFabric(
      makeAuth(
        { user: [], session: [], account: [] },
        publicKey,
        undefined,
        'stage-b'
      ),
      token
    )
    assert.equal(wrongStage.status, 401)

    const rightStage = await signInFabric(
      makeAuth(
        { user: [], session: [], account: [] },
        publicKey,
        undefined,
        'stage-a'
      ),
      token
    )
    assert.equal(rightStage.status, 200)
  })

  test('a stage that does not know its own id refuses a scoped token', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const res = await signInFabric(
      makeAuth({ user: [], session: [], account: [] }, publicKey),
      signToken(privateKey, { sub: 'op-1', aud: 'stage-a' })
    )
    assert.equal(res.status, 401)
  })

  test('an unscoped token is still accepted, so server-to-server callers keep working', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const res = await signInFabric(
      makeAuth(
        { user: [], session: [], account: [] },
        publicKey,
        undefined,
        'stage-a'
      ),
      signToken(privateKey, { sub: 'op-1' })
    )
    assert.equal(res.status, 200)
  })

  test('mints an admin session for a synthetic fabric operator row', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { granted, scopeService } = makeScopeService()
    const auth = makeAuth(db, publicKey, scopeService)

    const res = await signInFabric(
      auth,
      signToken(privateKey, { sub: 'op-123', name: 'Yasser' })
    )

    assert.equal(res.status, 200)
    assert.match(
      res.headers.getSetCookie().join('; '),
      /better-auth\.session_token=/
    )

    const body = await res.json()
    assert.equal(body.user.fabric, true)

    const row = db.user!.find((u) => u.id === body.user.id)
    assert.equal(row?.fabric, true, 'user row is flagged fabric')
    assert.deepEqual(
      granted,
      [
        { userId: body.user.id, scope: 'admin' },
        { userId: body.user.id, scope: 'virtualUser' },
      ],
      'fabric row is granted the roots an operator acts with'
    )
    // The grant is only worth anything if it satisfies the gates an operator
    // is signed in to reach, so check it through the same algebra they use.
    const operatorScopes = granted.map((g) => g.scope)
    assert.equal(
      hasScopes(['virtualUser:run'], operatorScopes),
      true,
      'an operator can start a virtual user run'
    )
    assert.equal(
      hasScopes(['admin:impersonate'], operatorScopes),
      true,
      'an operator can still impersonate'
    )
    assert.equal(
      hasScopes(['orders:refund'], operatorScopes),
      false,
      "but holds nothing in the application's own domain"
    )
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row — no duplicate operators.
    const res2 = await signInFabric(
      auth,
      signToken(privateKey, { sub: 'op-123' })
    )
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate fabric rows')
    assert.equal(granted.length, 2, 'a root already held is not granted twice')
  })

  test('an operator whose grant did not land gets it on the next sign-in', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { granted, scopeService } = makeScopeService()
    let failNext = true
    const flaky = {
      ...scopeService,
      addScopeToUser: async (userId: string, scope: string) => {
        if (failNext) {
          failNext = false
          throw new Error('scope store is down')
        }
        granted.push({ userId, scope })
      },
    }
    const auth = makeAuth(db, publicKey, flaky)

    const first = await signInFabric(
      auth,
      signToken(privateKey, { sub: 'op-456' })
    )
    assert.equal(first.status, 200, 'a failed grant does not fail sign-in')
    assert.deepEqual(granted, [], 'nothing was granted')

    const body = await first.json()
    const second = await signInFabric(
      auth,
      signToken(privateKey, { sub: 'op-456' })
    )
    assert.equal(second.status, 200)
    assert.deepEqual(
      granted,
      [
        { userId: body.user.id, scope: 'admin' },
        { userId: body.user.id, scope: 'virtualUser' },
      ],
      'the retry on the next sign-in lands both roots'
    )
  })

  test('a root the app never declared is not granted', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { granted, scopeService } = makeScopeService([])
    const auth = makeAuth(db, publicKey, scopeService)

    const res = await signInFabric(
      auth,
      signToken(privateKey, { sub: 'op-789' })
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(
      granted,
      [{ userId: body.user.id, scope: 'admin' }],
      "admin is this package's own root; virtualUser is the app's to declare"
    )
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
    const res = await signInFabric(
      makeAuth(db, publicKey),
      signToken(privateKey, { sub: 'op-1' })
    )
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not a fabric operator/)
  })

  test('rejects a wrong-key signature, expired/wrong-purpose tokens, and an unconfigured plugin', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }

    // Signed by an unrelated key → signature verification fails.
    const forged = await signInFabric(
      makeAuth(db, publicKey),
      signToken(other.privateKey, { sub: 'op-9' })
    )
    assert.equal(forged.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad signature')

    const now = Math.floor(Date.now() / 1000)
    const expired = await signInFabric(
      makeAuth(db, publicKey),
      signToken(privateKey, { sub: 'op-9', exp: now - 10 })
    )
    assert.equal(expired.status, 401)

    const wrongPurpose = await signInFabric(
      makeAuth(db, publicKey),
      signToken(privateKey, { sub: 'op-9', purpose: 'console' })
    )
    assert.equal(wrongPurpose.status, 401)

    // No public key configured → endpoint disabled.
    const unconfigured = await signInFabric(
      makeAuth(db, undefined),
      signToken(privateKey, { sub: 'op-9' })
    )
    assert.equal(unconfigured.status, 401)
    assert.equal(db.user!.length, 0)
  })
})
