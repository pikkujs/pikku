import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { deriveActorSecret } from '@pikku/core/services'

import { pikkuActor } from './actor-plugin.js'
import { DEV_ACTOR_SIGN_IN_ENV } from './actor-sign-in-gate.js'
import {
  pikkuDelegatedAuth,
  DELEGATED_PROVIDER_ID,
  type UpstreamIdentity,
} from './delegated-auth-plugin.js'
import { pikkuFabric } from './fabric-plugin.js'
import {
  pikkuCredentialOAuth,
  PLATFORM_USER_ID,
} from './credential-oauth.plugin.js'

/**
 * Who provisioned a user, as better-auth is told it.
 *
 * `internalAdapter.createUser(user, source)` routes `source` through
 * `assertValidUserInfoSource` and on into the app's `user.validateUserInfo`
 * hook, which is the only place an app can refuse a JIT-provisioned account —
 * "no delegated users from this upstream", "actors only outside production".
 * A hook that cannot tell which plugin is asking cannot make that call, and a
 * plugin that passes no source at all is refused outright, so the second
 * argument is load-bearing rather than decorative.
 *
 * Configuring the hook is what makes it observable: without it better-auth
 * never reads `source`, and dropping the argument would change nothing any
 * other test can see.
 */
const sourceRecorder = () => {
  const methods: string[] = []
  return {
    methods,
    user: {
      validateUserInfo: async ({ source }: any) => {
        methods.push(source?.method)
        return undefined
      },
    },
  }
}

const emptyDb = (): Record<string, any[]> => ({
  user: [],
  session: [],
  account: [],
  verification: [],
})

const ROOT = 'flow-secret-flow-secret-flow-secret'

const b64url = (input: Buffer | string): string =>
  (typeof input === 'string' ? Buffer.from(input) : input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const signFabricToken = (
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

const post = (
  auth: ReturnType<typeof betterAuth>,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  )

describe('every plugin tells better-auth who is provisioning the user', () => {
  beforeEach(() => {
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'
  })
  afterEach(() => {
    delete process.env[DEV_ACTOR_SIGN_IN_ENV]
  })

  test('an actor is provisioned as `actor`', async () => {
    const db = emptyDb()
    const recorder = sourceRecorder()
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'better-auth-test-secret',
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      user: recorder.user,
      plugins: [pikkuActor({ secret: ROOT })],
    })

    const res = await post(auth, '/sign-in/actor', {
      email: 'customer@actors.local',
      name: 'Customer',
      secret: await deriveActorSecret(ROOT, 'customer@actors.local'),
    })

    assert.equal(res.status, 200, await res.text())
    assert.deepEqual(recorder.methods, ['actor'])
  })

  test('a delegated user is provisioned as the delegated provider', async () => {
    const db = emptyDb()
    const recorder = sourceRecorder()
    const identity: UpstreamIdentity = {
      externalId: 'bb2-1',
      email: 'jane@corp.com',
      name: 'Jane Doe',
      credential: { token: 'jwt-1', expiresAt: 4102444800 },
    }
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'better-auth-test-secret',
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      user: recorder.user,
      plugins: [
        pikkuFabric({ publicKey: undefined }),
        pikkuDelegatedAuth({
          authenticate: async () => identity,
          storeCredential: async () => {},
        }),
      ],
    })

    const res = await post(auth, '/sign-in/delegated', {
      email: 'jane@corp.com',
      password: 'hunter2',
    })

    assert.equal(res.status, 200, await res.text())
    assert.deepEqual(recorder.methods, [DELEGATED_PROVIDER_ID])
  })

  test('a fabric operator is provisioned as `fabric`', async () => {
    const db = emptyDb()
    const recorder = sourceRecorder()
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'better-auth-test-secret',
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      user: recorder.user,
      plugins: [pikkuFabric({ publicKey })],
    })

    const res = await post(auth, '/sign-in/fabric', {
      token: signFabricToken(privateKey, { sub: 'op-1' }),
    })

    assert.equal(res.status, 200, await res.text())
    assert.deepEqual(recorder.methods, ['fabric'])
  })

  // The platform user is provisioned mid-link rather than at sign-in, so it
  // reaches the same gate — and an app that configures the hook would have its
  // singleton links answered 403 if this one were the plugin that forgot.
  test('the singleton platform user is provisioned as `credential-oauth`', async () => {
    const db = emptyDb()
    const recorder = sourceRecorder()
    const config = [
      {
        providerId: 'shared',
        type: 'singleton' as const,
        clientId: 'shared-client',
        clientSecret: 'shared-secret',
        authorizationUrl: 'https://shared.example/authorize',
        tokenUrl: 'https://shared.example/token',
        scopes: ['read'],
      },
    ]
    const build = (scopeService?: any) =>
      betterAuth({
        baseURL: 'http://localhost:3000',
        secret: 'better-auth-test-secret',
        database: memoryAdapter(db),
        emailAndPassword: { enabled: true },
        user: recorder.user,
        plugins: [pikkuCredentialOAuth({ config, scopeService } as any)],
      })

    const signUp = await post(build(), '/sign-up/email', {
      email: 'admin@example.com',
      password: 'CorrectHorse1!',
      name: 'Admin',
    })
    const { user } = await signUp.json()
    const cookie = signUp.headers.getSetCookie().join('; ')

    const res = await post(
      build({ resolveScopes: async () => ['admin'] }),
      '/credential-oauth/link',
      { providerId: 'shared' },
      { cookie }
    )

    assert.equal(res.status, 200, await res.text())
    assert.equal(
      db.user!.some((row) => row.id === PLATFORM_USER_ID),
      true
    )
    assert.deepEqual(
      recorder.methods.slice(recorder.methods.indexOf('credential-oauth')),
      ['credential-oauth'],
      `the platform user, provisioned after ${user.email} signed up, names the plugin that asked for it`
    )
  })
})
