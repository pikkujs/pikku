import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authCookie } from './auth-cookie.js'
import { resetPikkuState } from '../pikku-state.js'
import { CoreUserSession } from '../types/core.types.js'
import { PikkuSessionService } from '../services/user-session-service.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockHTTPRequest = (cookies: Record<string, string> = {}) => ({
  cookie: (name: string) => cookies[name] || null,
})

const createMockHTTPResponse = () => {
  const setCookies: Array<{
    name: string
    value: string
    options: any
  }> = []

  return {
    cookie: (name: string, value: string, options: any) => {
      setCookies.push({ name, value, options })
    },
    getCookies: () => setCookies,
  }
}

const createMockLogger = () => {
  const logs: Array<{ level: string; message: string }> = []
  return {
    info: (msg: string) => logs.push({ level: 'info', message: msg }),
    warn: (msg: string) => logs.push({ level: 'warn', message: msg }),
    error: (msg: string) => logs.push({ level: 'error', message: msg }),
    debug: (msg: string) => logs.push({ level: 'debug', message: msg }),
    getLogs: () => logs,
  }
}

describe('authCookie middleware', () => {
  test('should decode session from cookie on request', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user123' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async (token: string) => {
        assert.equal(token, 'cookie-jwt-value')
        return mockUserSession
      },
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({ session: 'cookie-jwt-value' }),
          response: mockResponse,
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should set cookie in response when session changes', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user456' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async (expiresIn: any, payload: any) => {
        assert.deepEqual(expiresIn, { value: 7, unit: 'day' })
        assert.deepEqual(payload, mockUserSession)
        return 'new-encoded-jwt'
      },
      decode: async () => null,
    }

    const middleware = authCookie({
      name: 'auth_token',
      expiresIn: { value: 7, unit: 'day' },
      options: { httpOnly: true, secure: true, sameSite: 'strict' },
    })

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({}),
          response: mockResponse,
        },
      } as any,
      async () => {
        // Simulate session change
        SessionService.set(mockUserSession)
      }
    )

    const setCookies = mockResponse.getCookies()
    assert.equal(setCookies.length, 1)
    assert.equal(setCookies[0].name, 'auth_token')
    assert.equal(setCookies[0].value, 'new-encoded-jwt')
    assert.equal(setCookies[0].options.httpOnly, true)
    assert.equal(setCookies[0].options.secure, true)
    assert.equal(setCookies[0].options.sameSite, 'strict')
    assert(setCookies[0].options.expires instanceof Date)
  })

  test('should not set cookie when session does not change', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user789' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async () => mockUserSession,
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({ session: 'existing-jwt' }),
          response: mockResponse,
        },
      } as any,
      async () => {
        // Session is loaded but not changed
      }
    )

    const setCookies = mockResponse.getCookies()
    assert.equal(setCookies.length, 0)
  })

  test('should not decode cookie when cookie is missing', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    let decodeCalled = false
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async () => {
        decodeCalled = true
        return { userId: 'test' }
      },
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({}),
          response: mockResponse,
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not set session when JWT decode returns null', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async () => null,
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({ session: 'invalid-jwt' }),
          response: mockResponse,
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
      encode: async () => 'encoded-jwt',
      decode: async () => {
        decodeCalled = true
        return { userId: 'new' }
      },
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({ session: 'some-jwt' }),
          response: mockResponse,
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
      encode: async () => 'encoded-jwt',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      { session: SessionService } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not decode when jwtService is not available on request', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })
    let nextCalled = false

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: undefined,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({ session: 'some-jwt' }),
          response: mockResponse,
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should warn when jwtService is not available on response and session changed', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user999' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const mockLogger = createMockLogger()

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: undefined,
        logger: mockLogger,
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({}),
          response: mockResponse,
        },
      } as any,
      async () => {
        // Simulate session change
        SessionService.set(mockUserSession)
      }
    )

    const logs = mockLogger.getLogs()
    assert.equal(logs.length, 1)
    assert.equal(logs[0].level, 'warn')
    assert.equal(
      logs[0].message,
      'No JWT service available, unable to set cookie'
    )

    const setCookies = mockResponse.getCookies()
    assert.equal(setCookies.length, 0)
  })

  test('should not set cookie when http.response is not available', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user888' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async () => null,
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 30, unit: 'day' },
      options: { httpOnly: true },
    })

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({}),
          response: undefined,
        },
      } as any,
      async () => {
        // Simulate session change
        SessionService.set(mockUserSession)
      }
    )

    // Should complete without errors even though response is not available
    assert.equal(SessionService.get(), mockUserSession)
  })

  test('should handle custom cookie name', async () => {
    const mockUserSession: CoreUserSession = { userId: 'custom-user' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'custom-encoded-jwt',
      decode: async (token: string) => {
        assert.equal(token, 'custom-cookie-value')
        return mockUserSession
      },
    }

    const middleware = authCookie({
      name: 'my_custom_cookie',
      expiresIn: { value: 1, unit: 'hour' },
      options: {},
    })

    const mockResponse = createMockHTTPResponse()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({
            my_custom_cookie: 'custom-cookie-value',
          }),
          response: mockResponse,
        },
      } as any,
      async () => {
        // Modify session to trigger cookie setting
        SessionService.set({ ...mockUserSession, extra: 'data' })
      }
    )

    const setCookies = mockResponse.getCookies()
    assert.equal(setCookies.length, 1)
    assert.equal(setCookies[0].name, 'my_custom_cookie')
  })

  test('should properly set expiration time in cookie options', async () => {
    const mockUserSession: CoreUserSession = { userId: 'expiry-test' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'encoded-jwt',
      decode: async () => null,
    }

    const middleware = authCookie({
      name: 'session',
      expiresIn: { value: 15, unit: 'minute' },
      options: { httpOnly: true },
    })

    const mockResponse = createMockHTTPResponse()
    const beforeTime = new Date()

    await middleware(
      {
        jwt: jwtService,
        logger: createMockLogger(),
      } as any,
      {
        session: SessionService,
        http: {
          request: createMockHTTPRequest({}),
          response: mockResponse,
        },
      } as any,
      async () => {
        SessionService.set(mockUserSession)
      }
    )

    const afterTime = new Date()
    const setCookies = mockResponse.getCookies()
    assert.equal(setCookies.length, 1)

    const expiresDate = setCookies[0].options.expires
    assert(expiresDate instanceof Date)

    // Expiration should be approximately 15 minutes from now
    const expectedExpiry = new Date(beforeTime.getTime() + 15 * 60 * 1000)
    const timeDiff = Math.abs(expiresDate.getTime() - expectedExpiry.getTime())
    // Allow 5 second tolerance for test execution time
    assert(timeDiff < 5000, `Time difference ${timeDiff}ms is too large`)
  })
})
