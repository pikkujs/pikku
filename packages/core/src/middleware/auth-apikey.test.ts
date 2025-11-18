import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { authAPIKey } from './auth-apikey.js'
import { resetPikkuState } from '../pikku-state.js'
import { CoreUserSession } from '../types/core.types.js'
import { PikkuSessionService } from '../services/user-session-service.js'

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
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'my-api-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should extract API key from query parameter when source is "query"', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user456' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-api-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should prefer header over query when source is "all" and both are present', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user789' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest(
            { 'x-api-key': 'header-key' },
            { apiKey: 'query-key' }
          ),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should fallback to query when header is missing and source is "all"', async () => {
    const mockUserSession: CoreUserSession = { userId: 'user999' }
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-fallback' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.deepEqual(SessionService.get(), mockUserSession)
  })

  test('should not set session when API key is not found', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not set session when JWT decode returns null', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
    const jwtService = {
      encode: async () => 'token',
      decode: async () => null,
    }

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'invalid-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
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

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'some-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
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

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { jwt: jwtService } as any,
      { session: SessionService } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not decode when jwtService is not available', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()

    const middleware = authAPIKey({ source: 'header' })
    let nextCalled = false

    await middleware(
      { jwt: undefined } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'some-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not look in query when source is "header" even if header is missing', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({}, { apiKey: 'query-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.equal(SessionService.get(), undefined)
  })

  test('should not look in header when source is "query" even if query is missing', async () => {
    const SessionService = new PikkuSessionService<CoreUserSession>()
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
      { jwt: jwtService } as any,
      {
        http: {
          request: createMockHTTPRequest({ 'x-api-key': 'header-key' }),
          response: createMockHTTPResponse(),
        },
        session: SessionService,
      } as any,
      async () => {
        nextCalled = true
      }
    )

    assert.equal(nextCalled, true)
    assert.equal(decodeCalled, false)
    assert.equal(SessionService.get(), undefined)
  })
})
