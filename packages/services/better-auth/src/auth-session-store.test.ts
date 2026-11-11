import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { makeSignature } from 'better-auth/crypto'
import {
  betterAuthStoreSession,
  type SessionTransport,
} from './auth-session-store.js'
import { inMemorySessionStore, prefixedSessionStore } from './session-store.js'

const SECRET = 'test-secret'
const TOKEN = 'sess_abc'
const USER = { id: 'u_1', email: 'a@b.c' }

const sign = async (token: string, secret = SECRET) =>
  `${token}.${await makeSignature(token, secret)}`

const storedSession = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ session: { id: TOKEN, ...overrides }, user: USER })

async function run(opts: {
  transports?: readonly SessionTransport[]
  authorization?: string
  cookie?: string
  seed?: { key: string; value: string } | null
  prefix?: string
  secretMissing?: boolean
  secretForbidden?: boolean
  existingSession?: unknown
  /** What `getSession()` reports — the session the chain has set so far. */
  live?: unknown
  /** Hand the middleware a store that returns already-parsed values. */
  parsedValues?: boolean
  extraHeaders?: Record<string, string>
  cookiePrefix?: string
}) {
  const backing = inMemorySessionStore()
  if (opts.seed !== null) {
    const seed = opts.seed ?? { key: TOKEN, value: storedSession() }
    await backing.set(seed.key, seed.value)
  }

  const captured: any[] = []
  const warnings: string[] = []
  let errored = false
  const services: any = {
    logger: {
      info() {},
      warn(message: string) {
        warnings.push(message)
      },
      error() {
        errored = true
      },
    },
    secrets: {
      getSecret: async () => {
        if (opts.secretForbidden) {
          throw new Error('Access denied to secret key: BETTER_AUTH_SECRET')
        }
        if (opts.secretMissing) {
          throw new Error('Requested secret not found: BETTER_AUTH_SECRET')
        }
        return { reveal: () => SECRET }
      },
    },
  }

  const headers: Record<string, string | undefined> = {
    authorization: opts.authorization,
    cookie: opts.cookie,
    ...opts.extraHeaders,
  }

  const wire: any = {
    http: {
      request: {
        header: (name: string) => headers[name.toLowerCase()],
        headers: () =>
          Object.fromEntries(
            Object.entries(headers).filter(([, v]) => v !== undefined)
          ),
      },
    },
    setInitialSession: (s: any) => captured.push(s),
    session: opts.existingSession,
    getSession: () => opts.live,
  }

  const store = opts.prefix
    ? prefixedSessionStore(backing, opts.prefix)
    : backing
  let reachedNext = false
  const mw = betterAuthStoreSession({
    store: () =>
      opts.parsedValues
        ? {
            get: async (key: string) => {
              const raw = await store.get(key)
              return raw === null ? null : JSON.parse(raw)
            },
          }
        : store,
    ...(opts.transports ? { transports: opts.transports } : {}),
    ...(opts.cookiePrefix ? { cookiePrefix: opts.cookiePrefix } : {}),
  })
  await mw(services, wire, async () => {
    reachedNext = true
  })

  return { session: captured[0] ?? null, reachedNext, errored, warnings }
}

describe('betterAuthStoreSession header transport', () => {
  test('resolves a session from a signed bearer token', async () => {
    const { session, reachedNext } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
    })
    assert.deepEqual(session, { userId: 'u_1' })
    assert.equal(reachedNext, true)
  })

  test('is case-insensitive on the Bearer prefix', async () => {
    const { session } = await run({
      authorization: `bearer ${await sign(TOKEN)}`,
    })
    assert.deepEqual(session, { userId: 'u_1' })
  })

  test('rejects a token signed with another secret', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN, 'other-secret')}`,
    })
    assert.equal(session, null)
  })

  test('rejects an unsigned bare token', async () => {
    const { session } = await run({ authorization: `Bearer ${TOKEN}` })
    assert.equal(session, null)
  })

  test('a valid credential for an evicted session resolves nothing', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      seed: null,
    })
    assert.equal(session, null)
  })

  test('an expired stored session is not accepted', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      seed: {
        key: TOKEN,
        value: storedSession({
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      },
    })
    assert.equal(session, null)
  })

  test('a missing secret skips the middleware without throwing', async () => {
    const { session, errored, reachedNext } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      transports: ['header'],
      secretMissing: true,
    })
    assert.equal(session, null)
    assert.equal(errored, true)
    assert.equal(reachedNext, true)
  })

  test('ignores the header when only the cookie transport is enabled', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      transports: ['cookie'],
    })
    assert.equal(session, null)
  })
})

describe('betterAuthStoreSession cookie transport', () => {
  test('resolves a session from the better-auth cookie', async () => {
    const { session } = await run({
      cookie: `better-auth.session_token=${await sign(TOKEN)}`,
    })
    assert.deepEqual(session, { userId: 'u_1' })
  })

  test('rejects a cookie whose signature does not match', async () => {
    const { session } = await run({
      cookie: `better-auth.session_token=${TOKEN}.notasignature`,
    })
    assert.equal(session, null)
  })

  test('ignores the cookie when only the header transport is enabled', async () => {
    const { session } = await run({
      cookie: `better-auth.session_token=${await sign(TOKEN)}`,
      transports: ['header'],
    })
    assert.equal(session, null)
  })
})

describe('betterAuthStoreSession behaviour', () => {
  test('both transports resolve the same session', async () => {
    const credential = await sign(TOKEN)
    const viaHeader = await run({ authorization: `Bearer ${credential}` })
    const viaCookie = await run({
      cookie: `better-auth.session_token=${credential}`,
    })
    assert.deepEqual(viaHeader.session, viaCookie.session)
  })

  test('an already-resolved session is left untouched', async () => {
    const { session, reachedNext } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      existingSession: { userId: 'someone-else' },
    })
    assert.equal(session, null)
    assert.equal(reachedNext, true)
  })

  test('no credential at all resolves nothing and continues', async () => {
    const { session, reachedNext } = await run({})
    assert.equal(session, null)
    assert.equal(reachedNext, true)
  })

  test('a prefixed store cannot read an unprefixed key', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      prefix: 'stage_1/',
    })
    assert.equal(session, null)
  })

  test('a prefixed store reads its own key', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      prefix: 'stage_1/',
      seed: { key: `stage_1/${TOKEN}`, value: storedSession() },
    })
    assert.deepEqual(session, { userId: 'u_1' })
  })
})

describe('betterAuthStoreSession matches the other session middlewares', () => {
  test('a session an earlier middleware set is never overwritten', async () => {
    const { session, reachedNext } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      live: { userId: 'set-by-an-earlier-middleware' },
    })
    assert.equal(session, null)
    assert.equal(reachedNext, true)
  })

  test('stands down quietly when the secret is withheld from this scope', async () => {
    const { session, errored, reachedNext } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      secretForbidden: true,
    })
    assert.equal(session, null)
    assert.equal(errored, false)
    assert.equal(reachedNext, true)
  })

  test('reads a session cookie relayed under AUTH_COOKIE_CROSS_SITE', async () => {
    const previous = process.env.AUTH_COOKIE_CROSS_SITE
    process.env.AUTH_COOKIE_CROSS_SITE = 'true'
    try {
      const { session } = await run({
        extraHeaders: {
          'x-pikku-cross-site-cookie': `better-auth.session_token=${await sign(TOKEN)}`,
        },
      })
      assert.deepEqual(session, { userId: 'u_1' })
    } finally {
      if (previous === undefined) delete process.env.AUTH_COOKIE_CROSS_SITE
      else process.env.AUTH_COOKIE_CROSS_SITE = previous
    }
  })

  test('ignores the relay header outside an embedding runtime', async () => {
    const { session } = await run({
      extraHeaders: {
        'x-pikku-cross-site-cookie': `better-auth.session_token=${await sign(TOKEN)}`,
      },
    })
    assert.equal(session, null)
  })

  test('reports an impersonation header nobody is configured to honour', async () => {
    const { warnings } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      extraHeaders: { 'x-pikku-impersonate-user-id': 'u_target' },
    })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /x-pikku-impersonate-user-id: u_target/)
  })

  test('accepts a store that returns parsed objects', async () => {
    const { session, errored } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      parsedValues: true,
    })
    assert.deepEqual(session, { userId: 'u_1' })
    assert.equal(errored, false)
  })

  test('a malformed expiry reads as expired', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      seed: { key: TOKEN, value: storedSession({ expiresAt: 'not-a-date' }) },
    })
    assert.equal(session, null)
  })

  test('a future expiry is accepted', async () => {
    const { session } = await run({
      authorization: `Bearer ${await sign(TOKEN)}`,
      seed: {
        key: TOKEN,
        value: storedSession({
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      },
    })
    assert.deepEqual(session, { userId: 'u_1' })
  })

  test('reads the session cookie under a custom cookiePrefix', async () => {
    const credential = await sign(TOKEN)
    const custom = await run({
      cookie: `my-app.session_token=${credential}`,
      cookiePrefix: 'my-app',
    })
    assert.deepEqual(custom.session, { userId: 'u_1' })
    const defaulted = await run({
      cookie: `my-app.session_token=${credential}`,
    })
    assert.equal(defaulted.session, null)
  })
})
