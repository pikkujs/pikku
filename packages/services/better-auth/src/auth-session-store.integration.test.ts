import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { bearer } from 'better-auth/plugins/bearer'

import { betterAuthStoreSession } from './auth-session-store.js'
import { inMemorySessionStore } from './session-store.js'

const SECRET = 'a-test-secret-for-store-backed-sessions'

const signUp = async () => {
  const store = inMemorySessionStore()
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
    plugins: [bearer()],
    secondaryStorage: {
      get: (key) => store.get(key),
      set: (key, value, ttl) => store.set(key, value, ttl),
      delete: (key) => store.delete(key),
    },
  })

  const response = await auth.api.signUpEmail({
    body: { email: 'user@example.com', password: 'password1234', name: 'User' },
    asResponse: true,
  })
  assert.equal(response.status, 200)

  const setCookie = response.headers.get('set-cookie') ?? ''
  const cookieValue = /better-auth\.session_token=([^;]+)/.exec(setCookie)?.[1]
  assert.ok(cookieValue, `no session cookie in ${setCookie}`)

  const authToken = response.headers.get('set-auth-token')
  assert.ok(authToken, 'bearer() did not echo set-auth-token')

  return { auth, store, cookieValue, authToken, setCookie }
}

const resolve = async (
  store: ReturnType<typeof inMemorySessionStore>,
  headers: Record<string, string>
) => {
  const captured: any[] = []
  const services: any = {
    logger: { info() {}, warn() {}, error() {} },
    secrets: { getSecret: async () => ({ reveal: () => SECRET }) },
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
  await betterAuthStoreSession({ store: () => store })(
    services,
    wire,
    async () => {}
  )
  return captured[0] ?? null
}

describe('betterAuthStoreSession against a real better-auth secondaryStorage', () => {
  test('a session better-auth wrote is resolvable by its cookie', async () => {
    const { store, cookieValue } = await signUp()
    const session = await resolve(store, {
      cookie: `better-auth.session_token=${cookieValue}`,
    })
    assert.equal(typeof session?.userId, 'string')
  })

  test('the token bearer() echoes on set-auth-token resolves the same session', async () => {
    const { store, authToken } = await signUp()
    const session = await resolve(store, {
      authorization: `Bearer ${authToken}`,
    })
    assert.equal(typeof session?.userId, 'string')
  })

  test('both transports resolve the same user', async () => {
    const { store, cookieValue, authToken } = await signUp()
    const viaCookie = await resolve(store, {
      cookie: `better-auth.session_token=${cookieValue}`,
    })
    const viaHeader = await resolve(store, {
      authorization: `Bearer ${authToken}`,
    })
    assert.deepEqual(viaCookie, viaHeader)
  })

  test('signing out makes both credentials resolve nothing', async () => {
    const { auth, store, cookieValue, authToken, setCookie } = await signUp()
    await auth.api.signOut({
      headers: new Headers({ cookie: setCookie.split(';')[0] ?? '' }),
    })
    assert.equal(
      await resolve(store, {
        cookie: `better-auth.session_token=${cookieValue}`,
      }),
      null
    )
    assert.equal(
      await resolve(store, { authorization: `Bearer ${authToken}` }),
      null
    )
  })
})
