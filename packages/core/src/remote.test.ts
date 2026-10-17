import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { buildRemoteHeaders } from './remote.js'
import { pikkuRemoteAuthMiddleware } from './middleware/remote-auth.js'
import { resetPikkuState } from './pikku-state.js'
import { WeakKeyMaterialError } from './errors/errors.js'
import { createSecretValue } from './classification/secret-value.js'

beforeEach(() => {
  resetPikkuState()
})

const algorithmName = (algorithm: AlgorithmIdentifier): string =>
  typeof algorithm === 'string' ? algorithm : algorithm.name

const STRONG_SECRET = 'a'.repeat(43)
const WEAK_SECRET = 'dev-remote-secret'

const createSecrets = (secret: string) => ({
  hasSecret: async (key: string) => key === 'PIKKU_REMOTE_SECRET',
  getSecret: async (key: string) => {
    if (key === 'PIKKU_REMOTE_SECRET') return createSecretValue(secret)
    throw new Error(`Secret ${key} not found`)
  },
})

/**
 * Signing is deliberately free here so the round trip exercises only the session encryption.
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

  test('a full round trip derives one HKDF key per hop and never runs a password KDF', async (t) => {
    const subtle = globalThis.crypto.subtle
    const importKey = t.mock.method(subtle, 'importKey')
    const deriveKey = t.mock.method(subtle, 'deriveKey')
    const deriveBits = t.mock.method(subtle, 'deriveBits')
    const session = { userId: 'user-1', role: 'admin' }
    assert.deepStrictEqual(await roundTrip(STRONG_SECRET, session), session)

    assert.deepStrictEqual(
      deriveKey.mock.calls.map((call) => algorithmName(call.arguments[0])),
      ['HKDF', 'HKDF']
    )
    assert.deepStrictEqual(
      importKey.mock.calls.map((call) => algorithmName(call.arguments[2])),
      ['HKDF', 'HKDF']
    )
    assert.strictEqual(deriveBits.mock.callCount(), 0)
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

describe('reading PIKKU_REMOTE_SECRET', () => {
  test('sends an unauthenticated call when no secret is configured', async () => {
    const headers = await buildRemoteHeaders(
      createJWT() as any,
      {
        hasSecret: async () => false,
        getSecret: async () => {
          throw new Error('not found')
        },
      } as any,
      'myFunc'
    )
    assert.strictEqual(headers.authorization, undefined)
  })

  test('sends an unauthenticated call when there is no secrets service', async () => {
    const headers = await buildRemoteHeaders(
      createJWT() as any,
      undefined,
      'myFunc'
    )
    assert.strictEqual(headers.authorization, undefined)
  })

  test('fails closed when the secrets backend errors on read', async () => {
    const backendError = new Error('vault unreachable')
    await assert.rejects(
      () =>
        buildRemoteHeaders(
          createJWT() as any,
          {
            hasSecret: async () => true,
            getSecret: async () => {
              throw backendError
            },
          } as any,
          'myFunc'
        ),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes('PIKKU_REMOTE_SECRET') &&
        err.cause === backendError
    )
  })

  test('fails closed when the secrets backend errors on lookup', async () => {
    await assert.rejects(
      () =>
        buildRemoteHeaders(
          createJWT() as any,
          {
            hasSecret: async () => {
              throw new Error('vault unreachable')
            },
            getSecret: async () => createSecretValue(STRONG_SECRET),
          } as any,
          'myFunc'
        ),
      /PIKKU_REMOTE_SECRET/
    )
  })
})
