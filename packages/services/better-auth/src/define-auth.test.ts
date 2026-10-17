import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { pikkuState } from '@pikku/core/state'

import { PIKKU_BETTER_AUTH, pikkuBetterAuth } from './define-auth.js'
import {
  markStatelessSessionInUse,
  resetStatelessSessionInUse,
  STATELESS_COOKIE_CACHE_MAX_AGE,
} from './stateless-cookie-default.js'

const SECRET = 'a-test-secret-for-pikku-better-auth-0123456789'

const servicesWith = (
  secrets: Record<string, unknown> = {},
  variables: Record<string, string> = {}
) => {
  const logs: string[] = []
  return {
    logs,
    services: {
      logger: {
        info: (m: string) => logs.push(m),
        warn: (m: string) => logs.push(m),
        error: (m: string) => logs.push(m),
        debug() {},
      },
      secrets: {
        getSecret: async (id: string) => {
          if (!(id in secrets)) {
            throw new Error(`Requested secret not found: ${id}`)
          }
          return { reveal: () => secrets[id] }
        },
      },
      variables: { get: async (id: string) => variables[id] },
    } as any,
  }
}

const build = (session?: Record<string, unknown>) =>
  betterAuth({
    secret: SECRET,
    baseURL: 'https://stage.example.com',
    database: memoryAdapter({}),
    emailAndPassword: { enabled: true },
    ...(session ? { session } : {}),
  })

describe('pikkuBetterAuth', () => {
  afterEach(() => resetStatelessSessionInUse())

  test('marks the factory and keeps the app’s own function beside it', () => {
    const factory = async () => build()
    const wrapped = pikkuBetterAuth(factory)
    assert.equal((wrapped as any)[PIKKU_BETTER_AUTH], true)
    assert.equal((wrapped as any).pikkuSourceFactory, factory)
    assert.equal(Object.keys(wrapped).length, 0, 'markers are not enumerable')
  })

  test('registers itself as the package auth factory', () => {
    const wrapped = pikkuBetterAuth(async () => build())
    assert.equal(pikkuState(null, 'package', 'authFactory'), wrapped)
  })

  test('hands the factory the services it was called with', async () => {
    const { services } = servicesWith()
    let received: unknown
    const wrapped = pikkuBetterAuth(async (s) => {
      received = s
      return build()
    })
    await wrapped(services)
    assert.equal(received, services)
  })

  test('returns the app’s instance untouched when nothing applies', async () => {
    const instance = build()
    const { services } = servicesWith()
    assert.equal(await pikkuBetterAuth(() => instance)(services), instance)
  })

  test('gives a stateless app’s unset cookie cache a day', async () => {
    markStatelessSessionInUse()
    const { services } = servicesWith()
    const instance = await pikkuBetterAuth(async () =>
      build({ cookieCache: { enabled: true } })
    )(services)
    const ctx = await instance.$context
    assert.equal(
      ctx.authCookies.sessionData.attributes.maxAge,
      STATELESS_COOKIE_CACHE_MAX_AGE
    )
  })

  test('routes through the OAuth proxy, then defaults the cookie on the proxied instance', async () => {
    markStatelessSessionInUse()
    const { services, logs } = servicesWith(
      {
        OAUTH_PROXY_SECRET: 'stage-key',
        GOOGLE_OAUTH: { clientId: 'cloud-google-id', clientSecret: 'x' },
      },
      {
        OAUTH_PROXY_URL: 'https://oauth.example.com',
        OAUTH_PROXY_PROVIDERS: 'google',
        OAUTH_PROXY_KEY_ID: '11111111-1111-4111-8111-111111111111',
      }
    )
    const original = build({ cookieCache: { enabled: true } })
    const instance = await pikkuBetterAuth(async () => original)(services)

    assert.notEqual(instance, original, 'the proxy rebuilds the instance')
    assert.ok(instance.options?.socialProviders?.google)
    assert.ok(
      instance.options?.plugins?.some((p: any) => p.id === 'oauth-proxy')
    )
    const ctx = await instance.$context
    assert.equal(
      ctx.authCookies.sessionData.attributes.maxAge,
      STATELESS_COOKIE_CACHE_MAX_AGE,
      'the default lands on the instance that is actually served'
    )
    assert.ok(logs.some((m) => m.includes('oauth.example.com')))
  })
})
