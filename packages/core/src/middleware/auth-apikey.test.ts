import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authAPIKey } from './auth-apikey.js'
import { resetPikkuState } from '../pikku-state.js'
import { CoreUserSession } from '../types/core.types.js'
import { PikkuUserSessionService } from '../services/user-session-service.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockHTTPRequest = (
  headers: Record<string, string> = {},
  query: Record<string, string> = {}
) => ({
  header: (name: string) => headers[name.toLowerCase()] || null,
  query: () => query,
})

const createMockHTTPResponse = () => ({
  cookie: () => {},
})

describe('authAPIKey middleware', () => {
  test('should extract API key from x-api-key header when source is "header"', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user123' }
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        assert.equal(token, 'my-api-key')
        return mockUserSession
      },
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'my-api-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(userSessionService.get(), mockUserSession)
  })

  test('should extract API key from query parameter when source is "query"', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user456' }
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        assert.equal(token, 'query-api-key')
        return mockUserSession
      },
    }

    const middleware = authAPIKey({ source: 'query' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-api-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(userSessionService.get(), mockUserSession)
  })

  test('should prefer header over query when source is "all" and both are present', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user789' }
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        // Should use header value, not query value
        assert.equal(token, 'header-key')
        return mockUserSession
      },
    }

    const middleware = authAPIKey({ source: 'all' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest(
            { 'x-api-key': 'header-key' },
            { apiKey: 'query-key' }
          ),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(userSessionService.get(), mockUserSession)
  })

  test('should fallback to query when header is missing and source is "all"', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user999' }
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async (token: string) => {
        assert.equal(token, 'query-fallback')
        return mockUserSession
      },
    }

    const middleware = authAPIKey({ source: 'all' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-fallback' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(userSessionService.get(), mockUserSession)
  })

  test('should not set session when API key is not found', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
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
    assert.equal(userSessionService.get(), undefined)
  })

  test('should not set session when JWT decode returns null', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'invalid-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(userSessionService.get(), undefined)
  })

  test('should skip middleware when session already exists', async () => {
    const existingSession: CoreUserSession = { userId: 'existing' }
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    userSessionService.setInitial(existingSession)

    let decodeCalled = false
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        decodeCalled = true
        return { userId: 'new' }
      },
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'some-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.deepEqual(userSessionService.get(), existingSession)
  })

  test('should skip middleware when http.request is not available', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => ({ userId: 'test' }),
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {} as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(userSessionService.get(), undefined)
  })

  test('should not decode when jwtService is not available', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: undefined } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'some-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(userSessionService.get(), undefined)
  })

  test('should not look in query when source is "header" even if header is missing', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    let decodeCalled = false
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        decodeCalled = true
        return { userId: 'test' }
      },
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.equal(userSessionService.get(), undefined)
  })

  test('should not look in header when source is "query" even if query is missing', async () => {
    const userSessionService = new PikkuUserSessionService<CoreUserSession>()
    let decodeCalled = false
    const jwtService = {
      encode: async () => 'token',
      decode: async () => {
        decodeCalled = true
        return { userId: 'test' }
      },
    }

    const middleware = authAPIKey({ source: 'query' })
    let nextCalled = false

    await middleware(
      { userSession: userSessionService, jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'header-key' }),
          response: createMockHTTPResponse(),
        },
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.equal(userSessionService.get(), undefined)
  })
})
