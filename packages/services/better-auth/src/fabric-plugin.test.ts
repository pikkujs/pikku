import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { fabric } from './fabric-plugin.js'

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
  const payload = { iss: 'test', iat: now, exp: now + 120, purpose: 'fabric-admin', ...claims }
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`
  const sig = b64url(createSign('RSA-SHA256').update(input).sign(signingKey))
  return `${input}.${sig}`
}

/** Records what the plugin grants the synthetic operator row. */
const makeScopeService = () => {
  const granted: Array<{ userId: string; scope: string }> = []
  return {
    granted,
    scopeService: {
      addScopeToUser: async (userId: string, scope: string) => {
        granted.push({ userId, scope })
      },
    } as any,
  }
}

const makeAuth = (
  db: Record<string, any[]>,
  key?: string,
  scopeService?: any
) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [fabric({ publicKey: key, scopeService })],
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
  test('mints an admin session for a synthetic fabric operator row', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const { granted, scopeService } = makeScopeService()
    const auth = makeAuth(db, publicKey, scopeService)

    const res = await signInFabric(auth, signToken(privateKey, { sub: 'op-123', name: 'Yasser' }))

    assert.equal(res.status, 200)
    assert.match(res.headers.getSetCookie().join('; '), /better-auth\.session_token=/)

    const body = await res.json()
    assert.equal(body.user.fabric, true)

    const row = db.user!.find((u) => u.id === body.user.id)
    assert.equal(row?.fabric, true, 'user row is flagged fabric')
    assert.deepEqual(
      granted,
      [{ userId: body.user.id, scope: 'admin' }],
      'fabric row is granted the admin scope'
    )
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row — no duplicate operators.
    const res2 = await signInFabric(auth, signToken(privateKey, { sub: 'op-123' }))
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate fabric rows')
    assert.equal(granted.length, 1, 'the grant is not repeated for a known row')
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
    const res = await signInFabric(makeAuth(db, publicKey), signToken(privateKey, { sub: 'op-1' }))
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not a fabric operator/)
  })

  test('rejects a wrong-key signature, expired/wrong-purpose tokens, and an unconfigured plugin', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }

    // Signed by an unrelated key → signature verification fails.
    const forged = await signInFabric(makeAuth(db, publicKey), signToken(other.privateKey, { sub: 'op-9' }))
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
    const unconfigured = await signInFabric(makeAuth(db, undefined), signToken(privateKey, { sub: 'op-9' }))
    assert.equal(unconfigured.status, 401)
    assert.equal(db.user!.length, 0)
  })
})
