import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authBearer } from './auth-bearer.js'
import { resetPikkuState } from '../pikku-state.js'
import type { CoreUserSession } from '../types/core.types.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../services/user-session-service.js'
import { InvalidSessionError } from '../errors/errors.js'
import { createSecretValue } from '../classification/secret-value.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockHTTPRequest = (headers: Record<string, string> = {}) => ({
  header: (name: string) => {
    return headers[name.toLowerCase()] || headers[name] || null
  },
})

const createMockHTTPResponse = () => ({
  cookie: () => {},
})

describe('authBearer middleware', () => {
  test('should extract and decode JWT bearer token from Authorization header', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user123' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        assert.equal(token, 'jwt-token')
        return mockUserSession
      },
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer jwt-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should handle case-insensitive Authorization header', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user456' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        assert.equal(token, 'jwt-token-2')
        return mockUserSession
      },
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            Authorization: 'Bearer jwt-token-2',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should validate static token when token option is provided', async () => {
    const mockUserSession: CoreUserSession = {
      userId: 'static-user',
      role: 'admin',
    }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        assert.fail('JWT decode should not be called in static token mode')
        return null
      },
    }

    const middleware = authBearer({
      token: {
        value: 'my-static-token',
        userSession: mockUserSession,
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer my-static-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should throw InvalidSessionError when scheme is not Bearer', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()

    await assert.rejects(
      async () => {
        await middleware(
          { jwt: jwtService } as any,
          {
            ...createMiddlewareSessionWireProps(SessionService),
            http: {
              request: createMockHTTPRequest({
                authorization: 'Basic some-token',
              }),
              response: createMockHTTPResponse(),
            },
          } as any,
          async () => {}
        )
      },
      (error: any) => {
        assert(error instanceof InvalidSessionError)
        return true
      }
    )
  })

  test('should throw InvalidSessionError when bearer token is missing', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()

    await assert.rejects(
      async () => {
        await middleware(
          { jwt: jwtService } as any,
          {
            ...createMiddlewareSessionWireProps(SessionService),
            http: {
              request: createMockHTTPRequest({
                authorization: 'Bearer',
              }),
              response: createMockHTTPResponse(),
            },
          } as any,
          async () => {}
        )
      },
      (error: any) => {
        assert(error instanceof InvalidSessionError)
        return true
      }
    )
  })

  test('should throw InvalidSessionError when authorization header has no space', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()

    await assert.rejects(
      async () => {
        await middleware(
          { jwt: jwtService } as any,
          {
            ...createMiddlewareSessionWireProps(SessionService),
            http: {
              request: createMockHTTPRequest({
                authorization: 'BearerToken',
              }),
              response: createMockHTTPResponse(),
            },
          } as any,
          async () => {}
        )
      },
      (error: any) => {
        assert(error instanceof InvalidSessionError)
        return true
      }
    )
  })

  test('should not set session when JWT decode returns null', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer invalid-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not set session when static token does not match', async () => {
    const mockUserSession: CoreUserSession = { userId: 'static-user' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        assert.fail('JWT decode should not be called in static token mode')
        return null
      },
    }

    const middleware = authBearer({
      token: {
        value: 'correct-token',
        userSession: mockUserSession,
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer wrong-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should skip middleware when session already exists', async () => {
    const existingSession: CoreUserSession = { userId: 'existing' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    SessionService.setInitial(existingSession)

    let decodeCalled = false
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        decodeCalled = true
        return { userId: 'new' }
      },
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer some-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.deepEqual(SessionService.get(), existingSession)
  })

  test('should skip middleware when http.request is not available', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      { ...createMiddlewareSessionWireProps(SessionService) } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should continue without session when authorization header is missing', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({}),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not decode when jwtService is not available in JWT mode', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: undefined } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer some-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should resolve the expected token from the secrets service in secretId mode', async () => {
    const mockUserSession: CoreUserSession = {
      userId: 'console-token',
      role: 'admin',
    }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        assert.fail('JWT decode should not be called in secretId mode')
        return null
      },
    }
    const secrets = {
      getSecret: async (secretId: string) => {
        assert.equal(secretId, 'PIKKU_CONSOLE_TOKEN')
        return createSecretValue('secret-token-value')
      },
    }

    const middleware = authBearer({
      token: {
        secretId: 'PIKKU_CONSOLE_TOKEN',
        userSession: mockUserSession,
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: jwtService, secrets } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer secret-token-value',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should continue without session when the secret is not configured', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const secrets = {
      getSecret: async () => {
        throw new Error('secret not found')
      },
    }

    const middleware = authBearer({
      token: {
        secretId: 'PIKKU_CONSOLE_TOKEN',
        userSession: { userId: 'console-token' },
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: undefined, secrets } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer anything',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not set session when secret-resolved token does not match', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const secrets = {
      getSecret: async () => createSecretValue('expected-token'),
    }

    const middleware = authBearer({
      token: {
        secretId: 'PIKKU_CONSOLE_TOKEN',
        userSession: { userId: 'console-token' },
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: undefined, secrets } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer wrong-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should work in static token mode even when jwtService is not available', async () => {
    const mockUserSession: CoreUserSession = { userId: 'static-user' }
    const SessionService = new PikkuSessionService<CoreUserSession>()

    const middleware = authBearer({
      token: {
        value: 'static-token',
        userSession: mockUserSession,
      },
    })
    let nextCalled = false

    await middleware(
      { jwt: undefined } as any,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest({
            authorization: 'Bearer static-token',
          }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })
})

describe('authBearer custom verifier', () => {
  const run = async (
    options: Parameters<typeof authBearer>[0],
    services: any = {},
    header: Record<string, string> = {
      authorization: 'Bearer opaque-secret-token',
    }
  ) => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    let nextCalled = false
    await authBearer(options)(
      services,
      {
        ...createMiddlewareSessionWireProps(SessionService),
        http: {
          request: createMockHTTPRequest(header),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )
    return { session: SessionService.get(), nextCalled }
  }

  test('sets the session the verifier returns, passing the token and services', async () => {
    const services = {
      marker: true,
      jwt: { decode: async () => assert.fail('jwt used') },
    }
    const { session, nextCalled } = await run(
      {
        verify: async (token, s) => {
          assert.equal(token, 'opaque-secret-token')
          assert.equal(s, services)
          return { userId: 'svc-1', scopes: ['a'] }
        },
      },
      services
    )
    assert.deepEqual(session, { userId: 'svc-1', scopes: ['a'] })
    assert.equal(nextCalled, true)
  })

  test('a null result answers 401 and does not continue', async () => {
    let nextCalled = false
    await assert.rejects(
      async () => {
        const r = await run({ verify: async () => null })
        nextCalled = r.nextCalled
      },
      (e: any) => e instanceof InvalidSessionError
    )
    assert.equal(nextCalled, false)
  })

  test('a throwing verifier answers 401 and the error does not leak the token', async () => {
    await assert.rejects(
      () =>
        run({
          verify: async (token) => {
            throw new Error(`db down while checking ${token}`)
          },
        }),
      (e: any) => {
        assert(e instanceof InvalidSessionError)
        assert.equal(e.cause, undefined)
        assert(!String(e.message).includes('opaque-secret-token'))
        assert(!String(e.stack).includes('opaque-secret-token'))
        return true
      }
    )
  })

  test('never logs the token, on success or failure', async () => {
    const logged: unknown[][] = []
    const logger: any = new Proxy(
      {},
      {
        get:
          () =>
          (...args: unknown[]) =>
            logged.push(args),
      }
    )
    await run({ verify: async () => ({ userId: 'u' }) }, { logger })
    await run({ verify: async () => null }, { logger }).catch(() => {})
    await run(
      {
        verify: async () => {
          throw new Error('x')
        },
      },
      { logger }
    ).catch(() => {})
    assert(!JSON.stringify(logged).includes('opaque-secret-token'))
  })

  test('without an Authorization header the verifier is not called', async () => {
    const { session, nextCalled } = await run(
      { verify: async () => assert.fail('called') },
      {},
      {}
    )
    assert.equal(session, undefined)
    assert.equal(nextCalled, true)
  })

  test('verify and token together are rejected at wiring time', () => {
    assert.throws(() =>
      authBearer({
        token: { value: 'x', userSession: { userId: 'u' } },
        verify: async () => null,
      })
    )
  })

  test('JWT and static modes are unchanged when verify is absent', async () => {
    const jwt = {
      encode: async () => 't',
      decode: async () => ({ userId: 'jwt-u' }),
    }
    assert.deepEqual((await run(undefined, { jwt })).session, {
      userId: 'jwt-u',
    })
    const stat = await run(
      {
        token: {
          value: 'opaque-secret-token',
          userSession: { userId: 'static-u' },
        },
      },
      { jwt }
    )
    assert.deepEqual(stat.session, { userId: 'static-u' })
    const wrong = await run(
      { token: { value: 'other', userSession: { userId: 'static-u' } } },
      { jwt }
    )
    assert.equal(wrong.session, undefined)
    assert.equal(wrong.nextCalled, true)
  })
})
