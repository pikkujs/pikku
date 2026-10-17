import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import {
  betterAuthStatelessSession,
  type BetterAuthStatelessSessionOptions,
  type CookieCacheStrategy,
} from './auth-session-stateless.js'
import {
  applyStatelessCookieCacheDefault,
  resetStatelessSessionInUse,
} from './stateless-cookie-default.js'

const SECRET = 'a-test-secret-for-stateless-sessions-0123456789'

afterEach(() => {
  resetStatelessSessionInUse()
})

const signUp = async ({
  strategy,
  version,
  cookiePrefix,
}: {
  strategy?: CookieCacheStrategy
  version?: string
  cookiePrefix?: string
} = {}) => {
  const auth = betterAuth({
    baseURL: 'http://localhost',
    secret: SECRET,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 300,
        ...(strategy ? { strategy } : {}),
        ...(version ? { version } : {}),
      },
    },
    ...(cookiePrefix ? { advanced: { cookiePrefix } } : {}),
  })
  const response = await auth.api.signUpEmail({
    body: { email: 'user@example.com', password: 'password1234', name: 'User' },
    asResponse: true,
  })
  assert.equal(response.status, 200)
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ')
  assert.match(cookie, /session_data=/, `no session_data cookie in ${cookie}`)
  return { auth, cookie }
}

const resolve = async (
  cookie: string,
  options: BetterAuthStatelessSessionOptions = {},
  extra: { headers?: Record<string, string>; services?: any } = {}
) => {
  const captured: any[] = []
  const headers: Record<string, string> = { cookie, ...extra.headers }
  const services: any = {
    logger: { info() {}, warn() {}, error() {} },
    secrets: { getSecret: async () => ({ reveal: () => SECRET }) },
    ...extra.services,
  }
  const wire: any = {
    http: {
      request: {
        header: (name: string) => headers[name.toLowerCase()],
        headers: () => headers,
      },
    },
    setSession: (s: any) => captured.push(s),
  }
  await betterAuthStatelessSession(options)(services, wire, async () => {})
  return captured[0] ?? null
}

describe('betterAuthStatelessSession reads the cookie better-auth wrote', () => {
  test('the default compact strategy resolves the signed-in user', async () => {
    const { cookie } = await signUp()
    const session = await resolve(cookie)
    assert.equal(typeof session?.userId, 'string')
  })

  for (const strategy of ['jwe', 'jwt'] as const) {
    test(`a ${strategy} cookie resolves without being told the strategy`, async () => {
      const { cookie } = await signUp({ strategy })
      const session = await resolve(cookie)
      assert.equal(typeof session?.userId, 'string')
    })

    test(`a pinned strategy refuses a ${strategy} cookie of another shape`, async () => {
      const { cookie } = await signUp({ strategy })
      const other = strategy === 'jwe' ? 'jwt' : 'jwe'
      const session = await resolve(cookie, {
        cookieCache: { strategy: other },
      }).catch(() => null)
      assert.equal(session, null)
    })
  }

  test('a cookie signed with another secret resolves nothing', async () => {
    const { cookie } = await signUp()
    const session = await resolve(
      cookie,
      {},
      {
        services: {
          secrets: {
            getSecret: async () => ({ reveal: () => 'some-other-secret' }),
          },
        },
      }
    )
    assert.equal(session, null)
  })

  test('a custom cookiePrefix is read only when passed', async () => {
    const { cookie } = await signUp({ cookiePrefix: 'my-app' })
    assert.equal(await resolve(cookie), null)
    const session = await resolve(cookie, { cookiePrefix: 'my-app' })
    assert.equal(typeof session?.userId, 'string')
  })

  test('cookieCache.version rejects a cookie of another version', async () => {
    const { cookie } = await signUp({ version: '2' })
    assert.equal(
      typeof (await resolve(cookie, { cookieCache: { version: '2' } }))?.userId,
      'string'
    )
    assert.equal(await resolve(cookie, { cookieCache: { version: '3' } }), null)
  })

  test('mapSession receives the cached user and session', async () => {
    const { cookie } = await signUp()
    const session = await resolve(cookie, {
      mapSession: ({ user, session }) => ({
        userId: `mapped:${user.email}`,
        orgId: session.id ? 'has-session' : 'none',
      }),
    })
    assert.deepEqual(session, {
      userId: 'mapped:user@example.com',
      orgId: 'has-session',
    })
  })

  test('impersonation resolves the target through loadUser', async () => {
    const { cookie } = await signUp()
    const session = await resolve(
      cookie,
      {
        impersonation: {
          canImpersonate: () => true,
          loadUser: async (id) => ({ id }),
        },
      },
      { headers: { 'x-pikku-impersonate-user-id': 'u_target' } }
    )
    assert.deepEqual(session, { userId: 'u_target' })
  })

  test('a cookie better-auth chunked across several is reassembled', async () => {
    const { cookie } = await signUp()
    const value = /better-auth\.session_data=([^;]+)/.exec(cookie)![1]!
    const half = Math.floor(value.length / 2)
    const chunked = cookie.replace(
      `better-auth.session_data=${value}`,
      `better-auth.session_data.1=${value.slice(half)}; better-auth.session_data.0=${value.slice(0, half)}`
    )
    const session = await resolve(chunked)
    assert.equal(typeof session?.userId, 'string')
  })

  test('no cookie at all resolves nothing', async () => {
    assert.equal(await resolve(''), null)
  })
})

describe('pikkuBetterAuth reports a stateless reader that disagrees with the config', () => {
  const errorsFor = async (
    middleware: BetterAuthStatelessSessionOptions,
    config: {
      strategy?: CookieCacheStrategy
      version?: string
      cookiePrefix?: string
    }
  ) => {
    betterAuthStatelessSession(middleware)
    const { auth } = await signUp(config)
    const errors: string[] = []
    await applyStatelessCookieCacheDefault(auth, {
      logger: {
        info() {},
        warn() {},
        error: (m: string) => errors.push(m),
        debug() {},
      } as any,
    })
    return errors
  }

  test('a matching reader is silent', async () => {
    assert.deepEqual(await errorsFor({}, {}), [])
  })

  test('another cookiePrefix is reported', async () => {
    const [error] = await errorsFor({}, { cookiePrefix: 'my-app' })
    assert.match(
      error!,
      /cookiePrefix is 'better-auth' but the auth config uses 'my-app'/
    )
  })

  test('a version the reader was not given is reported', async () => {
    const [error] = await errorsFor({}, { version: '2' })
    assert.match(error!, /cookieCache\.version/)
  })

  test('a pinned strategy that differs is reported', async () => {
    const [error] = await errorsFor(
      { cookieCache: { strategy: 'jwt' } },
      { strategy: 'jwe' }
    )
    assert.match(error!, /strategy is 'jwt' but the auth config uses 'jwe'/)
  })
})
