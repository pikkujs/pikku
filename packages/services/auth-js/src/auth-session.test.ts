import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { encode } from '@auth/core/jwt'
import { authJsSession } from './auth-session.js'
import type { CoreUserSession } from '@pikku/core'

const TEST_SECRET = 'test-secret-that-is-long-enough-for-auth-js'

const createToken = async (
  payload: Record<string, unknown>,
  salt = 'authjs.session-token'
) => {
  return encode({
    token: payload,
    secret: TEST_SECRET,
    salt,
    maxAge: 60 * 60,
  })
}

const createMockHTTPRequest = (cookies: Record<string, string> = {}) => ({
  cookie: (name: string) => cookies[name] || null,
})

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
})

const createSessionWireProps = () => {
  let session: CoreUserSession | undefined
  let changed = false
  return {
    session: undefined as CoreUserSession | undefined,
    setSession: (s: CoreUserSession) => {
      session = s
    },
    getSession: () => session,
    hasSessionChanged: () => changed,
    _getInternalSession: () => session,
    _markChanged: () => {
      changed = true
    },
  }
}

describe('authJsSession middleware', () => {
  test('should decode session from cookie', async () => {
    const token = await createToken({ sub: 'user123', email: 'a@b.com' })
    const wire = createSessionWireProps()

    const middleware = authJsSession({ secret: TEST_SECRET })
    let nextCalled = false

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            'authjs.session-token': token,
          }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    const session = wire._getInternalSession()
    assert.equal(session?.userId, 'user123')
  })

  test('should use mapSession to transform claims', async () => {
    const token = await createToken({
      sub: 'user456',
      email: 'test@example.com',
      name: 'Test User',
    })
    const wire = createSessionWireProps()

    const middleware = authJsSession({
      secret: TEST_SECRET,
      mapSession: (claims) => ({
        userId: claims.sub,
        email: claims.email,
      }),
    })

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            'authjs.session-token': token,
          }),
        },
      } as any,
      async () => {}
    )

    const session = wire._getInternalSession() as any
    assert.equal(session.userId, 'user456')
    assert.equal(session.email, 'test@example.com')
  })

  test('should try __Secure- prefixed cookie first', async () => {
    const secureSalt = '__Secure-authjs.session-token'
    const token = await createToken({ sub: 'secure-user' }, secureSalt)
    const wire = createSessionWireProps()

    const middleware = authJsSession({ secret: TEST_SECRET })

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            [secureSalt]: token,
          }),
        },
      } as any,
      async () => {}
    )

    const session = wire._getInternalSession()
    assert.equal(session?.userId, 'secure-user')
  })

  test('should use custom cookie name', async () => {
    const token = await createToken({ sub: 'custom-user' }, 'my-session')
    const wire = createSessionWireProps()

    const middleware = authJsSession({
      secret: TEST_SECRET,
      cookieName: 'my-session',
    })

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({ 'my-session': token }),
        },
      } as any,
      async () => {}
    )

    const session = wire._getInternalSession()
    assert.equal(session?.userId, 'custom-user')
  })

  test('should skip when no cookie present', async () => {
    const wire = createSessionWireProps()
    const middleware = authJsSession({ secret: TEST_SECRET })
    let nextCalled = false

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: { request: createMockHTTPRequest({}) },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(wire._getInternalSession(), undefined)
  })

  test('should skip when session already exists', async () => {
    const existing: CoreUserSession = { userId: 'existing' }
    const token = await createToken({ sub: 'new-user' })
    const wire = createSessionWireProps()
    wire.session = existing

    const middleware = authJsSession({ secret: TEST_SECRET })
    let nextCalled = false

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            'authjs.session-token': token,
          }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    // Session was not overwritten
    assert.equal(wire._getInternalSession(), undefined)
  })

  test('should skip when http.request is not available', async () => {
    const wire = createSessionWireProps()
    const middleware = authJsSession({ secret: TEST_SECRET })
    let nextCalled = false

    await middleware(
      { logger: createMockLogger() } as any,
      { ...wire } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(wire._getInternalSession(), undefined)
  })

  test('should handle invalid token gracefully', async () => {
    const wire = createSessionWireProps()
    const middleware = authJsSession({ secret: TEST_SECRET })
    let nextCalled = false

    await middleware(
      { logger: createMockLogger() } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            'authjs.session-token': 'not-a-valid-jwt',
          }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(wire._getInternalSession(), undefined)
  })

  test('should resolve secret from secretId via services.secrets', async () => {
    const token = await createToken({ sub: 'secret-id-user' })
    const wire = createSessionWireProps()

    const middleware = authJsSession({ secretId: 'MY_AUTH_SECRET' })
    let nextCalled = false

    await middleware(
      {
        logger: createMockLogger(),
        secrets: {
          getSecret: async (key: string) => {
            assert.equal(key, 'MY_AUTH_SECRET')
            return TEST_SECRET
          },
        },
      } as any,
      {
        ...wire,
        http: {
          request: createMockHTTPRequest({
            'authjs.session-token': token,
          }),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    const session = wire._getInternalSession()
    assert.equal(session?.userId, 'secret-id-user')
  })

  test('should throw if session is modified during request', async () => {
    const token = await createToken({ sub: 'user789' })
    const wire = createSessionWireProps()

    const middleware = authJsSession({ secret: TEST_SECRET })

    await assert.rejects(
      () =>
        middleware(
          { logger: createMockLogger() } as any,
          {
            ...wire,
            http: {
              request: createMockHTTPRequest({
                'authjs.session-token': token,
              }),
            },
          } as any,
          async () => {
            wire._markChanged()
          }
        ),
      {
        message:
          'Session is read-only when using Auth.js. Use Auth.js routes (/auth/session) to modify sessions.',
      }
    )
  })
})
