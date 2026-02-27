import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { pikkuRemoteAuthMiddleware } from './remote-auth.js'
import { UnauthorizedError } from '../errors/errors.js'
import { resetPikkuState } from '../pikku-state.js'
import { encryptJSON } from '../crypto-utils.js'

beforeEach(() => {
  resetPikkuState()
})

const TEST_SECRET = 'test-remote-secret-key'

const createMockSecrets = (secret?: string) => ({
  getSecret: async (key: string) => {
    if (key === 'PIKKU_REMOTE_SECRET' && secret !== undefined) {
      return secret
    }
    throw new Error(`Secret ${key} not found`)
  },
})

const createMockJWT = (payload?: any, shouldThrow = false) => ({
  decode: async (_token: string) => {
    if (shouldThrow) throw new Error('Invalid token')
    return payload
  },
  encode: async () => 'token',
})

const createMockRequest = (
  headers: Record<string, string> = {},
  path = '/api/test',
  method = 'POST'
) => ({
  header: (name: string) => headers[name.toLowerCase()] || headers[name],
  path: () => path,
  method: () => method,
})

describe('pikkuRemoteAuthMiddleware', () => {
  test('should call next when no http.request', async () => {
    let nextCalled = false
    await pikkuRemoteAuthMiddleware(
      { secrets: createMockSecrets(TEST_SECRET) } as any,
      { http: {} } as any,
      async () => {
        nextCalled = true
      }
    )
    assert.strictEqual(nextCalled, true)
  })

  test('should call next when no secrets service', async () => {
    let nextCalled = false
    await pikkuRemoteAuthMiddleware(
      {} as any,
      { http: { request: createMockRequest() } } as any,
      async () => {
        nextCalled = true
      }
    )
    assert.strictEqual(nextCalled, true)
  })

  test('should call next when PIKKU_REMOTE_SECRET not found', async () => {
    let nextCalled = false
    await pikkuRemoteAuthMiddleware(
      { secrets: createMockSecrets() } as any,
      { http: { request: createMockRequest() } } as any,
      async () => {
        nextCalled = true
      }
    )
    assert.strictEqual(nextCalled, true)
  })

  test('should throw when PIKKU_REMOTE_SECRET set but no jwt service', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          { secrets: createMockSecrets(TEST_SECRET) } as any,
          { http: { request: createMockRequest() } } as any,
          async () => {}
        ),
      { message: 'PIKKU_REMOTE_SECRET set but JWT service missing' }
    )
  })

  test('should throw UnauthorizedError when no authorization header', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT(),
          } as any,
          { http: { request: createMockRequest({}) } } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should throw UnauthorizedError for non-Bearer scheme', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT(),
          } as any,
          {
            http: {
              request: createMockRequest({ authorization: 'Basic abc123' }),
            },
          } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should throw UnauthorizedError when Bearer has no token', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT(),
          } as any,
          {
            http: { request: createMockRequest({ authorization: 'Bearer' }) },
          } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should throw UnauthorizedError when JWT decode fails', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT(null, true),
          } as any,
          {
            http: {
              request: createMockRequest({
                authorization: 'Bearer valid-token',
              }),
            },
          } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should throw UnauthorizedError when audience is not pikku-remote', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT({ aud: 'wrong-audience' }),
          } as any,
          {
            http: {
              request: createMockRequest({
                authorization: 'Bearer valid-token',
              }),
            },
          } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should throw UnauthorizedError when audience is missing', async () => {
    await assert.rejects(
      () =>
        pikkuRemoteAuthMiddleware(
          {
            secrets: createMockSecrets(TEST_SECRET),
            jwt: createMockJWT({}),
          } as any,
          {
            http: {
              request: createMockRequest({
                authorization: 'Bearer valid-token',
              }),
            },
          } as any,
          async () => {}
        ),
      (err: any) => err instanceof UnauthorizedError
    )
  })

  test('should call next for valid token with correct audience', async () => {
    let nextCalled = false
    await pikkuRemoteAuthMiddleware(
      {
        secrets: createMockSecrets(TEST_SECRET),
        jwt: createMockJWT({ aud: 'pikku-remote' }),
      } as any,
      {
        http: {
          request: createMockRequest({ authorization: 'Bearer valid-token' }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )
    assert.strictEqual(nextCalled, true)
  })

  test('should accept Authorization header (capitalized)', async () => {
    let nextCalled = false
    await pikkuRemoteAuthMiddleware(
      {
        secrets: createMockSecrets(TEST_SECRET),
        jwt: createMockJWT({ aud: 'pikku-remote' }),
      } as any,
      {
        http: {
          request: createMockRequest({ Authorization: 'Bearer valid-token' }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )
    assert.strictEqual(nextCalled, true)
  })

  describe('RPC function authorization', () => {
    test('should throw UnauthorizedError when token fn does not match requested function', async () => {
      await assert.rejects(
        () =>
          pikkuRemoteAuthMiddleware(
            {
              secrets: createMockSecrets(TEST_SECRET),
              jwt: createMockJWT({ aud: 'pikku-remote', fn: 'allowedFunc' }),
            } as any,
            {
              http: {
                request: createMockRequest(
                  { authorization: 'Bearer valid-token' },
                  '/rpc/otherFunc'
                ),
              },
            } as any,
            async () => {}
          ),
        (err: any) => err instanceof UnauthorizedError
      )
    })

    test('should allow when token fn matches requested function', async () => {
      let nextCalled = false
      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({ aud: 'pikku-remote', fn: 'myFunc' }),
        } as any,
        {
          http: {
            request: createMockRequest(
              { authorization: 'Bearer valid-token' },
              '/rpc/myFunc'
            ),
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )
      assert.strictEqual(nextCalled, true)
    })

    test('should allow any RPC call when token has no fn claim', async () => {
      let nextCalled = false
      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({ aud: 'pikku-remote' }),
        } as any,
        {
          http: {
            request: createMockRequest(
              { authorization: 'Bearer valid-token' },
              '/rpc/anyFunc'
            ),
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )
      assert.strictEqual(nextCalled, true)
    })

    test('should skip fn check for non-RPC paths even if fn in token', async () => {
      let nextCalled = false
      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({ aud: 'pikku-remote', fn: 'someFunc' }),
        } as any,
        {
          http: {
            request: createMockRequest(
              { authorization: 'Bearer valid-token' },
              '/api/other'
            ),
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )
      assert.strictEqual(nextCalled, true)
    })

    test('should handle URI-encoded function names', async () => {
      let nextCalled = false
      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({ aud: 'pikku-remote', fn: 'my func' }),
        } as any,
        {
          http: {
            request: createMockRequest(
              { authorization: 'Bearer valid-token' },
              '/rpc/my%20func'
            ),
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )
      assert.strictEqual(nextCalled, true)
    })
  })

  describe('session decryption', () => {
    test('should decrypt and set session when payload.session exists', async () => {
      const sessionData = { userId: 'user-1', role: 'admin' }
      const encryptedSession = await encryptJSON(TEST_SECRET, {
        session: sessionData,
      })
      let receivedSession: any

      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({
            aud: 'pikku-remote',
            session: encryptedSession,
          }),
        } as any,
        {
          http: {
            request: createMockRequest({ authorization: 'Bearer valid-token' }),
          },
          setSession: async (session: any) => {
            receivedSession = session
          },
        } as any,
        async () => {}
      )

      assert.deepStrictEqual(receivedSession, sessionData)
    })

    test('should throw UnauthorizedError when session decryption fails', async () => {
      await assert.rejects(
        () =>
          pikkuRemoteAuthMiddleware(
            {
              secrets: createMockSecrets(TEST_SECRET),
              jwt: createMockJWT({
                aud: 'pikku-remote',
                session: 'invalid-encrypted-data',
              }),
            } as any,
            {
              http: {
                request: createMockRequest({
                  authorization: 'Bearer valid-token',
                }),
              },
              setSession: async () => {},
            } as any,
            async () => {}
          ),
        (err: any) => err instanceof UnauthorizedError
      )
    })

    test('should skip setSession when setSession is not available', async () => {
      const encryptedSession = await encryptJSON(TEST_SECRET, {
        session: { userId: 'u1' },
      })
      let nextCalled = false

      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({
            aud: 'pikku-remote',
            session: encryptedSession,
          }),
        } as any,
        {
          http: {
            request: createMockRequest({ authorization: 'Bearer valid-token' }),
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(nextCalled, true)
    })

    test('should skip setSession when decrypted.session is falsy', async () => {
      const encryptedSession = await encryptJSON(TEST_SECRET, { session: null })
      let setSessionCalled = false

      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({
            aud: 'pikku-remote',
            session: encryptedSession,
          }),
        } as any,
        {
          http: {
            request: createMockRequest({ authorization: 'Bearer valid-token' }),
          },
          setSession: async () => {
            setSessionCalled = true
          },
        } as any,
        async () => {}
      )

      assert.strictEqual(setSessionCalled, false)
    })

    test('should not call setSession when no session in payload', async () => {
      let setSessionCalled = false
      let nextCalled = false

      await pikkuRemoteAuthMiddleware(
        {
          secrets: createMockSecrets(TEST_SECRET),
          jwt: createMockJWT({ aud: 'pikku-remote' }),
        } as any,
        {
          http: {
            request: createMockRequest({ authorization: 'Bearer valid-token' }),
          },
          setSession: async () => {
            setSessionCalled = true
          },
        } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(setSessionCalled, false)
      assert.strictEqual(nextCalled, true)
    })
  })
})
