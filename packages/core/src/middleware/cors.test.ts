import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { cors } from './cors.js'
import { resetPikkuState } from '../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockRequest = (method = 'get', origin?: string) => ({
  method: () => method,
  header: (name: string) => {
    if (name === 'origin') return origin
    return undefined
  },
})

const createMockResponse = () => {
  const headers: Record<string, string> = {}
  let statusCode: number | undefined
  let jsonBody: any
  return {
    header: (name: string, value: string) => {
      headers[name] = value
    },
    status: (code: number) => {
      statusCode = code
      return {
        json: (body: any) => {
          jsonBody = body
        },
      }
    },
    json: (body: any) => {
      jsonBody = body
    },
    _headers: headers,
    _getStatus: () => statusCode,
    _getJson: () => jsonBody,
  }
}

describe('cors', () => {
  describe('configuration validation', () => {
    test('should throw when wildcard origin used with credentials', () => {
      assert.throws(() => cors({ origin: '*', credentials: true }), {
        message:
          'CORS misconfiguration: wildcard origin (*) cannot be used with credentials: true',
      })
    })

    test('should not throw with wildcard origin and no credentials', () => {
      const middleware = cors({ origin: '*' })
      assert.ok(middleware)
    })

    test('should not throw with specific origin and credentials', () => {
      const middleware = cors({
        origin: 'https://example.com',
        credentials: true,
      })
      assert.ok(middleware)
    })

    test('should not throw with default options', () => {
      const middleware = cors()
      assert.ok(middleware)
    })
  })

  describe('wildcard origin', () => {
    test('should set Access-Control-Allow-Origin to * by default', async () => {
      const middleware = cors()
      const request = createMockRequest()
      const response = createMockResponse()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(response._headers['Access-Control-Allow-Origin'], '*')
      assert.strictEqual(nextCalled, true)
    })
  })

  describe('single origin', () => {
    test('should set Access-Control-Allow-Origin to specified origin', async () => {
      const middleware = cors({ origin: 'https://example.com' })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Origin'],
        'https://example.com'
      )
    })
  })

  describe('array of origins', () => {
    test('should use request origin when it matches array', async () => {
      const middleware = cors({ origin: ['https://a.com', 'https://b.com'] })
      const request = createMockRequest('get', 'https://b.com')
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Origin'],
        'https://b.com'
      )
    })

    test('should use first origin when request origin not in array', async () => {
      const middleware = cors({ origin: ['https://a.com', 'https://b.com'] })
      const request = createMockRequest('get', 'https://unknown.com')
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Origin'],
        'https://a.com'
      )
    })

    test('should use first origin when no request origin header', async () => {
      const middleware = cors({ origin: ['https://a.com', 'https://b.com'] })
      const request = createMockRequest('get')
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Origin'],
        'https://a.com'
      )
    })

    test('should set Vary: Origin header when origin is array', async () => {
      const middleware = cors({ origin: ['https://a.com', 'https://b.com'] })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(response._headers['Vary'], 'Origin')
    })
  })

  describe('headers', () => {
    test('should set default allowed methods', async () => {
      const middleware = cors()
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Methods'],
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      )
    })

    test('should set default allowed headers', async () => {
      const middleware = cors()
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Headers'],
        'Content-Type, Authorization, x-api-key'
      )
    })

    test('should set custom methods', async () => {
      const middleware = cors({ methods: ['GET', 'POST'] })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Methods'],
        'GET, POST'
      )
    })

    test('should set custom headers', async () => {
      const middleware = cors({ headers: ['X-Custom'] })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Headers'],
        'X-Custom'
      )
    })

    test('should not set Vary when origin is string', async () => {
      const middleware = cors({ origin: 'https://example.com' })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(response._headers['Vary'], undefined)
    })
  })

  describe('credentials', () => {
    test('should set Access-Control-Allow-Credentials when enabled', async () => {
      const middleware = cors({
        origin: 'https://example.com',
        credentials: true,
      })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Credentials'],
        'true'
      )
    })

    test('should not set credentials header when disabled', async () => {
      const middleware = cors({ credentials: false })
      const request = createMockRequest()
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(
        response._headers['Access-Control-Allow-Credentials'],
        undefined
      )
    })
  })

  describe('OPTIONS preflight', () => {
    test('should return 204 for OPTIONS requests', async () => {
      const middleware = cors()
      const request = createMockRequest('options')
      const response = createMockResponse()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(response._getStatus(), 204)
      assert.strictEqual(nextCalled, false)
    })

    test('should set Access-Control-Max-Age for OPTIONS', async () => {
      const middleware = cors({ maxAge: 3600 })
      const request = createMockRequest('options')
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(response._headers['Access-Control-Max-Age'], '3600')
    })

    test('should use default maxAge of 86400', async () => {
      const middleware = cors()
      const request = createMockRequest('options')
      const response = createMockResponse()

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {}
      )

      assert.strictEqual(response._headers['Access-Control-Max-Age'], '86400')
    })

    test('should call next for non-OPTIONS requests', async () => {
      const middleware = cors()
      const request = createMockRequest('get')
      const response = createMockResponse()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(nextCalled, true)
    })

    test('should call next for POST requests', async () => {
      const middleware = cors()
      const request = createMockRequest('post')
      const response = createMockResponse()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { request, response } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(nextCalled, true)
    })
  })

  describe('missing http', () => {
    test('should call next when no request', async () => {
      const middleware = cors()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { response: createMockResponse() } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(nextCalled, true)
    })

    test('should call next when no response', async () => {
      const middleware = cors()
      let nextCalled = false

      await middleware(
        {} as any,
        { http: { request: createMockRequest() } } as any,
        async () => {
          nextCalled = true
        }
      )

      assert.strictEqual(nextCalled, true)
    })

    test('should call next when no http', async () => {
      const middleware = cors()
      let nextCalled = false

      await middleware({} as any, {} as any, async () => {
        nextCalled = true
      })

      assert.strictEqual(nextCalled, true)
    })
  })
})
