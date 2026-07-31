import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { buildRemoteHeaders } from './remote.js'
import { pikkuRemoteAuthMiddleware } from './middleware/remote-auth.js'
import { resetPikkuState } from './pikku-state.js'
import { WeakKeyMaterialError } from './errors/errors.js'

beforeEach(() => {
  resetPikkuState()
})

const STRONG_SECRET = 'a'.repeat(43)
const WEAK_SECRET = 'dev-remote-secret'

const createSecrets = (secret: string) => ({
  getSecret: async (key: string) => {
    if (key === 'PIKKU_REMOTE_SECRET') return secret
    throw new Error(`Secret ${key} not found`)
  },
})

/**
 * Signing is deliberately free here so the measurement isolates key derivation.
 */
const createJWT = () => ({
  encode: async (_expiresIn: unknown, payload: unknown) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async (token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')),
})

const createRequest = (
  headers: Record<string, string>,
  path = '/remote/rpc/myFunc'
) => ({
  header: (name: string) => headers[name.toLowerCase()] || headers[name],
  path: () => path,
  method: () => 'POST',
})

const roundTrip = async (secret: string, session: unknown) => {
  const jwt = createJWT()
  const secrets = createSecrets(secret)

  const headers = await buildRemoteHeaders(
    jwt as any,
    secrets as any,
    'myFunc',
    session
  )

  let received: unknown
  await pikkuRemoteAuthMiddleware(
    { secrets, jwt } as any,
    {
      http: {
        request: createRequest({ authorization: headers.authorization! }),
      },
      setSession: async (s: unknown) => {
        received = s
      },
    } as any,
    async () => {}
  )
  return received
}

describe('remote RPC session round trip', () => {
  test('round-trips the session through header build and middleware verify', async () => {
    const session = { userId: 'user-1', role: 'admin' }
    assert.deepStrictEqual(await roundTrip(STRONG_SECRET, session), session)
  })

  test('a header built with one secret is rejected by a peer holding another', async () => {
    const jwt = createJWT()
    const headers = await buildRemoteHeaders(
      jwt as any,
      createSecrets(STRONG_SECRET) as any,
      'myFunc',
      { userId: 'user-1' }
    )

    await assert.rejects(() =>
      pikkuRemoteAuthMiddleware(
        { secrets: createSecrets('b'.repeat(43)), jwt } as any,
        {
          http: {
            request: createRequest({ authorization: headers.authorization! }),
          },
          setSession: async () => {},
        } as any,
        async () => {}
      )
    )
  })

  test('a full round trip stays under the per-hop latency budget', async () => {
    const session = { userId: 'user-1', role: 'admin' }

    // Warm up so the measurement excludes module/JIT startup.
    await roundTrip(STRONG_SECRET, session)

    const iterations = 5
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      await roundTrip(STRONG_SECRET, session)
    }
    const perRoundTrip = (performance.now() - start) / iterations

    assert.ok(
      perRoundTrip < 20,
      `remote RPC round trip took ${perRoundTrip.toFixed(1)}ms, budget is 20ms`
    )
  })
})

describe('PIKKU_REMOTE_SECRET strength', () => {
  test('buildRemoteHeaders rejects a secret shorter than 32 characters', async () => {
    await assert.rejects(
      () =>
        buildRemoteHeaders(
          createJWT() as any,
          createSecrets(WEAK_SECRET) as any,
          'myFunc',
          { userId: 'user-1' }
        ),
      (err: unknown) => err instanceof WeakKeyMaterialError
    )
  })

  test('buildRemoteHeaders rejects a weak secret even with no session to encrypt', async () => {
    await assert.rejects(
      () =>
        buildRemoteHeaders(
          createJWT() as any,
          createSecrets(WEAK_SECRET) as any,
          'myFunc'
        ),
      (err: unknown) => err instanceof WeakKeyMaterialError
    )
  })

  test('the middleware rejects a weak secret rather than authenticating with it', async () => {
    const jwt = createJWT()
    const headers = await buildRemoteHeaders(
      jwt as any,
      createSecrets(STRONG_SECRET) as any,
      'myFunc',
      { userId: 'user-1' }
    )

    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          { secrets: createSecrets(WEAK_SECRET), jwt } as any,
          {
            http: {
              request: createRequest({ authorization: headers.authorization! }),
            },
            setSession: async () => {},
          } as any,
          async () => {}
        ),
      (err: unknown) => err instanceof WeakKeyMaterialError
    )
  })

  test('a secret of exactly 32 characters is accepted', async () => {
    const session = { userId: 'user-1' }
    assert.deepStrictEqual(await roundTrip('x'.repeat(32), session), session)
  })
})
