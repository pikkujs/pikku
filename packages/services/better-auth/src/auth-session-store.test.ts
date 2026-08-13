import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHMAC } from '@better-auth/utils/hmac'
import {
  betterAuthStoreSession,
  type SessionTransport,
} from './auth-session-store.js'
import { inMemorySessionStore, prefixedSessionStore } from './session-store.js'

const SECRET = 'test-secret'
const TOKEN = 'sess_abc'
const USER = { id: 'u_1', email: 'a@b.c' }

const sign = async (token: string, secret = SECRET) =>
  `${token}.${await createHMAC('SHA-256', 'base64urlnopad').sign(secret, token)}`

const storedSession = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ session: { id: TOKEN, ...overrides }, user: USER })

async function run(opts: {
  transports?: readonly SessionTransport[]
  authorization?: string
  cookie?: string
  seed?: { key: string; value: string } | null
  prefix?: string
  secretMissing?: boolean
  existingSession?: unknown
}) {
  const backing = inMemorySessionStore()
  if (opts.seed !== null) {
    const seed = opts.seed ?? { key: TOKEN, value: storedSession() }
    await backing.set(seed.key, seed.value)
  }

  const captured: any[] = []
  let errored = false
  const services: any = {
    logger: {
      info() {},
      warn() {},
      error() {
        errored = true
      },
    },
    secrets: {
      getSecret: async () => {
        if (opts.secretMissing) {
          throw new Error('Requested secret not found')
        }
        return { reveal: () => SECRET }
      },
    },
  }

  const headers: Record<string, string | undefined> = {
    authorization: opts.authorization,
    cookie: opts.cookie,
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
    setSession: (s: any) => captured.push(s),
    session: opts.existingSession,
  }

  let reachedNext = false
  const mw = betterAuthStoreSession({
    store: () =>
      opts.prefix ? prefixedSessionStore(backing, opts.prefix) : backing,
    ...(opts.transports ? { transports: opts.transports } : {}),
  })
  await mw(services, wire, async () => {
    reachedNext = true
  })

  return { session: captured[0] ?? null, reachedNext, errored }
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
