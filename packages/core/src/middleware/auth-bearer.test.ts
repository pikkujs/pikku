import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authBearer } from './auth-bearer.js'
import { resetPikkuState } from '../pikku-state.js'
import { CoreUserSession } from '../types/core.types.js'
import { PikkuUserWireService } from '../services/user-session-service.js'
import { InvalidSessionError } from '../errors/errors.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockHTTPRequest = (headers: Record<string, string> = {}) => ({
  header: (name: string) => {
    // Check both lowercase and exact case
    return headers[name.toLowerCase()] || headers[name] || null
  },
})

const createMockHTTPResponse = () => ({
  cookie: () => {},
})

describe('authBearer middleware', () => {
  test('should extract and decode JWT bearer token from Authorization header', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user123' }
    const userWireService = new PikkuUserWireService<CoreUserSession>()
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
        session: userWireService,
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
    assert.deepEqual(userWireService.get(), mockUserSession)
  })

  test('should handle case-insensitive Authorization header', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user456' }
    const userWireService = new PikkuUserWireService<CoreUserSession>()
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
        session: userWireService,
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
    assert.deepEqual(userWireService.get(), mockUserSession)
  })

  test('should validate static token when token option is provided', async () => {
    const mockUserSession: CoreUserSession = {
      userId: 'static-user',
      role: 'admin',
    }
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        // Should not be called in static token mode
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
        session: userWireService,
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
    assert.deepEqual(userWireService.get(), mockUserSession)
  })

  test('should throw InvalidSessionError when scheme is not Bearer', async () => {
    const userWireService = new PikkuUserWireService<CoreUserSession>()
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
            session: userWireService,
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
    const userWireService = new PikkuUserWireService<CoreUserSession>()
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
            session: userWireService,
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
    const userWireService = new PikkuUserWireService<CoreUserSession>()
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
            session: userWireService,
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
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        session: userWireService,
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
    assert.equal(userWireService.get(), undefined)
  })

  test('should not set session when static token does not match', async () => {
    const mockUserSession: CoreUserSession = { userId: 'static-user' }
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        // Should not be called when static token is provided
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
        session: userWireService,
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
    assert.equal(userWireService.get(), undefined)
  })

  test('should skip middleware when session already exists', async () => {
    const existingSession: CoreUserSession = { userId: 'existing' }
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    userWireService.setInitial(existingSession)

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
        session: userWireService,
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
    assert.deepEqual(userWireService.get(), existingSession)
  })

  test('should skip middleware when http.request is not available', async () => {
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      { session: userWireService } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(userWireService.get(), undefined)
  })

  test('should continue without session when authorization header is missing', async () => {
    const userWireService = new PikkuUserWireService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        session: userWireService,
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
    assert.equal(userWireService.get(), undefined)
  })

  test('should not decode when jwtService is not available in JWT mode', async () => {
    const userWireService = new PikkuUserWireService<CoreUserSession>()

    const middleware = authBearer()
    let nextCalled = false

    await middleware(
      { jwt: undefined } as any,
      {
        session: userWireService,
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
    assert.equal(userWireService.get(), undefined)
  })

  test('should work in static token mode even when jwtService is not available', async () => {
    const mockUserSession: CoreUserSession = { userId: 'static-user' }
    const userWireService = new PikkuUserWireService<CoreUserSession>()

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
        session: userWireService,
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
    assert.deepEqual(userWireService.get(), mockUserSession)
  })
})
