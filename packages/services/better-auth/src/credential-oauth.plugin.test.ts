import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import {
  pikkuCredentialOAuth,
  PLATFORM_USER_ID,
} from './credential-oauth.plugin.js'
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
    plugins: [pikkuCredentialOAuth({ config, ...options } as any)],
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

/**
 * Answers the provider's token endpoint, so the callback can be driven without
 * a real OAuth2 server. Returns the restore for the real fetch.
 */
const stubTokenEndpoint = () => {
  const real = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url =
      typeof input === 'string' ? input : (input?.url ?? String(input))
    if (url.endsWith('/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          token_type: 'bearer',
          expires_in: 3600,
          scope: 'read',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    return real(input, init)
  }) as typeof fetch
  return () => {
    globalThis.fetch = real
  }
}

const callback = (
  auth: ReturnType<typeof makeAuth>,
  providerId: string,
  state: string,
  cookie: string
) =>
  auth.handler(
    new Request(
      `http://localhost:3000/api/auth/credential-oauth/callback/${providerId}?code=auth-code&state=${state}`,
      {
        method: 'GET',
        headers: { origin: 'http://localhost:3000', cookie },
      }
    )
  )

/**
 * Start a link and read back everything the callback needs: the `state` the
 * provider would echo, and the state cookie better-auth pairs it with.
 */
const startLink = async (
  auth: ReturnType<typeof makeAuth>,
  providerId: string,
  sessionCookie: string
) => {
  const res = await link(auth, providerId, sessionCookie)
  assert.equal(res.status, 200, await res.clone().text())
  const { url } = await res.json()
  return {
    state: new URL(url).searchParams.get('state') as string,
    cookie: [sessionCookie, ...res.headers.getSetCookie()].join('; '),
  }
}

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

  // Who the credential belongs to was decided when the link started and signed
  // into the state; the callback reads it from there rather than re-deriving it
  // from the returning request.
  test('the callback writes the account against the signed state', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('acme', 'wire')])
    const { userId, cookie } = await signUp(auth, 'user@example.com')
    const started = await startLink(auth, 'acme', cookie)

    const restore = stubTokenEndpoint()
    try {
      const res = await callback(auth, 'acme', started.state, started.cookie)
      assert.equal(res.status, 302)
      assert.doesNotMatch(res.headers.get('location') ?? '', /\?error=/)
    } finally {
      restore()
    }

    const row = db.account!.find((account) => account.providerId === 'acme')
    assert.equal(row?.userId, userId)
    assert.equal(
      row?.accountId,
      userId,
      'a credential has no identity of its own, so the owner is what identifies the account'
    )
  })

  // A singleton is the platform's, and the state is what says so — the admin
  // who clicked Connect holds the callback's session cookie but must not end up
  // owning the token.
  test('a singleton callback links the platform user, not the admin who clicked', async () => {
    const db = emptyDb()
    let auth = makeAuth(db, [provider('shared', 'singleton')])
    const { userId, cookie } = await signUp(auth, 'admin@example.com')
    auth = makeAuth(db, [provider('shared', 'singleton')], {
      scopeService: scopeStore({ [userId]: ['admin'] }),
    })
    const started = await startLink(auth, 'shared', cookie)

    const restore = stubTokenEndpoint()
    try {
      const res = await callback(auth, 'shared', started.state, started.cookie)
      assert.equal(res.status, 302)
    } finally {
      restore()
    }

    const row = db.account!.find((account) => account.providerId === 'shared')
    assert.equal(row?.userId, PLATFORM_USER_ID)
    assert.equal(row?.accountId, PLATFORM_USER_ID)
  })

  // Re-linking has to land on the same row: getAccessToken takes the first
  // match for (providerId, userId), so a second row would shadow the token
  // that was just refreshed.
  test('re-linking updates the row in place rather than shadowing it', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, [provider('acme', 'wire')])
    const { cookie } = await signUp(auth, 'user@example.com')

    const restore = stubTokenEndpoint()
    try {
      const first = await startLink(auth, 'acme', cookie)
      await callback(auth, 'acme', first.state, first.cookie)
      const second = await startLink(auth, 'acme', cookie)
      await callback(auth, 'acme', second.state, second.cookie)
    } finally {
      restore()
    }

    assert.equal(
      db.account!.filter((account) => account.providerId === 'acme').length,
      1,
      'exactly one account row for the provider'
    )
  })
})
