import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { credentialOAuth, PLATFORM_USER_ID } from './credential-oauth.plugin.js'
import type { CredentialOAuthProvider } from './credential-oauth-providers.js'

const provider = (
  providerId: string,
  type: NonNullable<CredentialOAuthProvider['type']>
): CredentialOAuthProvider => ({
  providerId,
  type,
  clientId: `${providerId}-client`,
  clientSecret: `${providerId}-secret`,
  authorizationUrl: `https://${providerId}.example/authorize`,
  tokenUrl: `https://${providerId}.example/token`,
  scopes: ['read'],
})

/**
 * A scope store holding exactly the grants named, shaped like the slice of
 * `ScopeService` the default gate reaches for.
 */
const scopeStore = (grants: Record<string, string[]>) =>
  ({
    resolveScopes: async (userId: string) => grants[userId] ?? [],
  }) as any

const makeAuth = (
  db: Record<string, any[]>,
  config: CredentialOAuthProvider[],
  options: Record<string, unknown> = {}
) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [credentialOAuth({ config, ...options } as any)],
  })

const emptyDb = (): Record<string, any[]> => ({
  user: [],
  session: [],
  account: [],
  verification: [],
})

/** Sign up a real user and return their id plus the session cookie header. */
const signUp = async (
  auth: ReturnType<typeof makeAuth>,
  email: string
): Promise<{ userId: string; cookie: string }> => {
  const res = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ email, password: 'CorrectHorse1!', name: 'Test' }),
    })
  )
  const body = await res.json()
  assert.equal(res.status, 200, JSON.stringify(body))
  return {
    userId: body.user.id,
    cookie: res.headers.getSetCookie().join('; '),
  }
}

const link = (
  auth: ReturnType<typeof makeAuth>,
  providerId: string,
  cookie?: string
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/credential-oauth/link', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ providerId }),
    })
  )

describe('credentialOAuth plugin', () => {
  test('an anonymous caller cannot start a link', async () => {
    const auth = makeAuth(emptyDb(), [provider('acme', 'wire')])

    const res = await link(auth, 'acme')

    assert.equal(res.status, 401)
  })

  test('an undeclared provider is a 404, not a redirect into nowhere', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('acme', 'wire')])
    const { cookie } = await signUp(auth, 'user@example.com')

    const res = await link(auth, 'not-declared', cookie)

    assert.equal(res.status, 404)
  })

  test('a per-user `wire` link sends the caller to the provider', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('acme', 'wire')])
    const { cookie } = await signUp(auth, 'user@example.com')

    const res = await link(auth, 'acme', cookie)

    assert.equal(res.status, 200)
    const { url } = await res.json()
    assert.match(url, /^https:\/\/acme\.example\/authorize\?/)
    assert.match(url, /client_id=acme-client/)
    // The callback is the plugin's own, not genericOAuth's.
    assert.match(url, /credential-oauth%2Fcallback%2Facme/)
  })

  // Connecting a singleton rebinds the token for EVERY user of the app, so an
  // ordinary signed-in caller must not be able to do it just by being signed in.
  test('a singleton link is refused without admin:credentials:link', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('shared', 'singleton')], {
      scopeService: scopeStore({}),
    })
    const { cookie } = await signUp(auth, 'user@example.com')

    const res = await link(auth, 'shared', cookie)

    assert.equal(res.status, 403)
    assert.equal(
      db.user!.some((u) => u.id === PLATFORM_USER_ID),
      false,
      'a refused link must not leave a platform user behind'
    )
  })

  // The gate defaults to denying rather than allowing: an app that forgets to
  // pass its ScopeService gets no singleton links, not unguarded ones.
  test('a singleton link is refused when no ScopeService is registered', async () => {
    const auth = makeAuth(emptyDb(), [provider('shared', 'singleton')])
    const { cookie } = await signUp(auth, 'user@example.com')

    const res = await link(auth, 'shared', cookie)

    assert.equal(res.status, 403)
  })

  test('a scope holder may link a singleton, and it hangs off the platform user', async () => {
    const db = emptyDb()
    let auth = makeAuth(db, [provider('shared', 'singleton')])
    const { userId, cookie } = await signUp(auth, 'admin@example.com')

    // Rebuild against the same store now that the grant holder's id is known.
    auth = makeAuth(db, [provider('shared', 'singleton')], {
      scopeService: scopeStore({ [userId]: ['admin:credentials:link'] }),
    })

    const res = await link(auth, 'shared', cookie)

    assert.equal(res.status, 200)
    assert.equal(
      db.user!.some((u) => u.id === PLATFORM_USER_ID),
      true,
      'the singleton owner is the reserved platform user, not the admin who clicked'
    )
  })

  // Holding the parent `admin` root satisfies everything beneath it — the same
  // rule every other pikku scope gate follows.
  test('the admin scope root satisfies the singleton gate', async () => {
    const db = emptyDb()
    let auth = makeAuth(db, [provider('shared', 'singleton')])
    const { userId, cookie } = await signUp(auth, 'root@example.com')
    auth = makeAuth(db, [provider('shared', 'singleton')], {
      scopeService: scopeStore({ [userId]: ['admin'] }),
    })

    const res = await link(auth, 'shared', cookie)

    assert.equal(res.status, 200)
  })

  test('canLinkSingleton overrides the default gate', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('shared', 'singleton')], {
      canLinkSingleton: () => true,
    })
    const { cookie } = await signUp(auth, 'user@example.com')

    const res = await link(auth, 'shared', cookie)

    assert.equal(res.status, 200)
  })

  // Created on demand, once: an app with no singleton credentials should never
  // grow the row, and two links should not race a second one into existence.
  test('the platform user is created once and reused', async () => {
    const db = emptyDb()
    let auth = makeAuth(db, [provider('shared', 'singleton')])
    const { userId, cookie } = await signUp(auth, 'admin@example.com')
    auth = makeAuth(db, [provider('shared', 'singleton')], {
      scopeService: scopeStore({ [userId]: ['admin'] }),
    })

    await link(auth, 'shared', cookie)
    await link(auth, 'shared', cookie)

    assert.equal(
      db.user!.filter((u) => u.id === PLATFORM_USER_ID).length,
      1,
      'exactly one platform user row'
    )
  })
})
