import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { applyOAuthProxy, resolveOAuthProxyConfig } from './oauth-proxy.js'

const PROXY = 'https://oauth.example.com'
const KEY_ID = '11111111-1111-4111-8111-111111111111'

const makeServices = (
  secrets: Record<string, unknown>,
  variables: Record<string, string>
) => {
  const logs: string[] = []
  return {
    logs,
    services: {
      logger: { info: (m: string) => logs.push(m) } as any,
      secrets: {
        getSecret: async (id: string) => {
          if (!(id in secrets)) throw new Error(`Requested secret not found: ${id}`)
          return { reveal: () => secrets[id] }
        },
      },
      variables: { get: async (id: string) => variables[id] },
    },
  }
}

const full = () =>
  makeServices(
    {
      OAUTH_PROXY_SECRET: 'stage-key',
      GOOGLE_OAUTH: { clientId: 'fabric-google-id', clientSecret: 'oauth-proxy' },
    },
    {
      OAUTH_PROXY_URL: PROXY,
      OAUTH_PROXY_PROVIDERS: 'google',
      OAUTH_PROXY_KEY_ID: KEY_ID,
    }
  )

const makeAuth = (socialProviders?: Record<string, unknown>) =>
  betterAuth({
    secret: 'test-secret-test-secret-test-secret',
    baseURL: 'https://stage.example.com',
    database: memoryAdapter({}),
    emailAndPassword: { enabled: true },
    socialProviders: socialProviders as any,
  })

describe('resolveOAuthProxyConfig', () => {
  test('is null when nothing is configured', async () => {
    const { services } = makeServices({}, {})
    assert.equal(await resolveOAuthProxyConfig(services), null)
  })

  test('reads a full configuration', async () => {
    const { services } = full()
    const config = await resolveOAuthProxyConfig(services)
    assert.deepEqual(config, {
      productionURL: PROXY,
      secret: 'stage-key',
      keyId: KEY_ID,
      providers: {
        google: { clientId: 'fabric-google-id', clientSecret: 'oauth-proxy' },
      },
    })
  })

  test('is null when the stage lists no providers', async () => {
    const { services } = makeServices(
      { OAUTH_PROXY_SECRET: 'stage-key' },
      { OAUTH_PROXY_URL: PROXY, OAUTH_PROXY_PROVIDERS: 'none' }
    )
    assert.equal(await resolveOAuthProxyConfig(services), null)
  })

  test('does not read a backend failure as no configuration', async () => {
    const { services } = makeServices({}, {})
    services.secrets.getSecret = async () => {
      throw new Error('connection refused')
    }
    await assert.rejects(
      () => resolveOAuthProxyConfig(services),
      /connection refused/
    )
  })

  test('reads a secret this wiring was not granted as absent', async () => {
    const { services } = makeServices({}, {})
    services.secrets.getSecret = async (id: string) => {
      throw new Error(`Access denied to secret key: ${id}`)
    }
    assert.equal(await resolveOAuthProxyConfig(services), null)
  })

  test('names what is missing when only part is set', async () => {
    const { services } = makeServices(
      { OAUTH_PROXY_SECRET: 'stage-key' },
      { OAUTH_PROXY_URL: PROXY }
    )
    await assert.rejects(
      () => resolveOAuthProxyConfig(services),
      /partly configured: OAUTH_PROXY_PROVIDERS not set/
    )
  })

  test('refuses a provider it does not know', async () => {
    const { services } = makeServices(
      { OAUTH_PROXY_SECRET: 'k' },
      { OAUTH_PROXY_URL: PROXY, OAUTH_PROXY_PROVIDERS: 'nope' }
    )
    await assert.rejects(
      () => resolveOAuthProxyConfig(services),
      /"nope" .* is not a known provider/
    )
  })

  test('refuses a listed provider with no credentials', async () => {
    const { services } = makeServices(
      { OAUTH_PROXY_SECRET: 'k' },
      { OAUTH_PROXY_URL: PROXY, OAUTH_PROXY_PROVIDERS: 'github' }
    )
    await assert.rejects(
      () => resolveOAuthProxyConfig(services),
      /github is listed .* GITHUB_OAUTH has no clientId/
    )
  })
})

describe('applyOAuthProxy', () => {
  test('returns the same instance when the proxy is not configured', async () => {
    const { services } = makeServices({}, {})
    const auth = makeAuth()
    assert.equal(await applyOAuthProxy(auth, services), auth)
  })

  test('starts a sign-in through the proxy with the key id in state', async () => {
    const { services, logs } = full()
    const auth = await applyOAuthProxy(makeAuth(), services)

    const result = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: '/app' },
    })
    const url = new URL(result.url!)

    assert.equal(url.host, 'accounts.google.com')
    assert.equal(url.searchParams.get('client_id'), 'fabric-google-id')
    assert.equal(
      url.searchParams.get('redirect_uri'),
      `${PROXY}/api/auth/callback/google`
    )
    assert.ok(url.searchParams.get('state')!.startsWith(`${KEY_ID}.`))
    assert.match(logs.join('\n'), /google goes through https:\/\/oauth.example.com/)
  })

  test('leaves the app its own providers and plugins', async () => {
    const { services } = full()
    const auth = await applyOAuthProxy(
      makeAuth({
        github: { clientId: 'own-github', clientSecret: 'own-secret' },
      }),
      services
    )
    const options = (auth as any).options
    assert.equal(options.socialProviders.github.clientId, 'own-github')
    assert.equal(options.socialProviders.google.clientId, 'fabric-google-id')
    assert.equal(options.emailAndPassword.enabled, true)
  })

  test('omits the key id prefix when none is configured', async () => {
    const { services } = makeServices(
      {
        OAUTH_PROXY_SECRET: 'stage-key',
        GOOGLE_OAUTH: { clientId: 'fabric-google-id', clientSecret: 'x' },
      },
      { OAUTH_PROXY_URL: PROXY, OAUTH_PROXY_PROVIDERS: 'google' }
    )
    const auth = await applyOAuthProxy(makeAuth(), services)
    const result = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: '/app' },
    })
    const state = new URL(result.url!).searchParams.get('state')!
    assert.ok(!state.includes('.'))
  })

  test('refuses a provider the app also configures itself', async () => {
    const { services } = full()
    await assert.rejects(
      () =>
        applyOAuthProxy(
          makeAuth({ google: { clientId: 'own', clientSecret: 'own' } }),
          services
        ),
      /google, which the app also configures/
    )
  })
})
