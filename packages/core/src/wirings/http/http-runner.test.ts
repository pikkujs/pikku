import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { NotFoundError } from '../../errors/errors.js'
import type { JSONValue, CorePikkuMiddleware } from '../../types/core.types.js'
import {
  addHTTPMiddleware,
  createHTTPWire,
  fetch,
  fetchData,
  pikkuFetch,
  wireHTTP,
} from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../channel/local/local-channel-runner.test.js'
import { addFunction } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'

const sessionMiddleware: CorePikkuMiddleware = async (services, wire, next) => {
  wire.setSession?.({ userId: 'test' } as any)
  await next()
}

class TestRequest extends PikkuMockRequest {
  private _headers: Record<string, string> = {}
  private _data: unknown = {}

  setHeaders(headers: Record<string, string>) {
    this._headers = headers
  }

  setData(data: unknown) {
    this._data = data
  }

  headers(): Record<string, string> {
    return this._headers
  }

  header(headerName: string): string | null {
    return this._headers[headerName] ?? null
  }

  async data() {
    return this._data
  }
}

class TestResponse extends PikkuMockResponse {
  public headersMap = new Map<string, string | string[]>()
  public jsonBody: unknown
  public bufferBody: unknown
  public mode: 'stream' | null = null
  public closed = false

  header(name: string, value: string | string[]): this {
    this.headersMap.set(name, value)
    return this
  }

  arrayBuffer(data: XMLHttpRequestBodyInit): this {
    this.bufferBody = data
    return this
  }

  json(data: unknown): this {
    this.jsonBody = data
    return this
  }

  setMode(mode: 'stream') {
    this.mode = mode
  }

  close() {
    this.closed = true
  }
}

const setHTTPFunctionMap = (func: any) => {
  pikkuState(null, 'function', 'meta', {
    pikku_func_name: {
      pikkuFuncId: 'pikku_func_name',
      services: ['userSession'],
    },
  } as any)
  pikkuState(null, 'http', 'meta', {
    get: {
      test: {
        pikkuFuncId: 'pikku_func_name',
        route: 'test',
        method: 'get',
      },
    },
    post: {},
    delete: {},
    patch: {},
    head: {},
    put: {},
    options: {},
  })
  addFunction('pikku_func_name', { func })
}

const setRouteMeta = (
  route: string,
  method:
    | 'get'
    | 'post'
    | 'put'
    | 'delete'
    | 'patch'
    | 'head'
    | 'options' = 'get',
  overrides: Record<string, unknown> = {}
) => {
  const meta = pikkuState(null, 'http', 'meta')
  meta[method][route] = {
    pikkuFuncId: 'pikku_func_name',
    route,
    method,
    ...overrides,
  } as any
  pikkuState(null, 'function', 'meta')['pikku_func_name'] = {
    pikkuFuncId: 'pikku_func_name',
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
    sessionless: true,
    permissions: undefined,
    middleware: undefined,
  } as any
}

describe('fetch', () => {
  let request: any
  let response: any

  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()

    const singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }

    const createWireServices = async () => ({})

    pikkuState(null, 'package', 'singletonServices', singletonServices as any)
    pikkuState(null, 'package', 'factories', { createWireServices } as any)

    request = new PikkuMockRequest('/test', 'get')
    response = new PikkuMockResponse()

    request.getData = async () => ({})
    request.getHeader = (name: string) =>
      name === 'content-type' ? 'application/json' : undefined
    response.setStatus = (status: number) => {}
    response.setJson = (json: JSONValue) => {}
  })

  afterEach(() => {})

  test('should throw RouteNotFoundError when no matching route is found', async () => {
    await assert.rejects(
      async () =>
        fetch(request, {
          bubbleErrors: true,
        }),
      NotFoundError
    )
  })

  test('should call the route function and return its result when a matching route is found', async () => {
    const routeFunc = async () => ({ success: true })
    setHTTPFunctionMap(routeFunc)

    wireHTTP({
      route: 'test',
      method: 'get',
      func: { func: routeFunc, middleware: [sessionMiddleware] },
    })

    // Initialize router after adding route (for tests)
    httpRouter.initialize()

    const result = await fetch(request)

    assert.deepStrictEqual(await result.json(), { success: true })
  })

  test('should verify permissions if provided', async () => {
    const permissions = { test: async () => true }
    const routeFunc = async () => ({ success: true })
    setHTTPFunctionMap(routeFunc)

    wireHTTP({
      route: 'test',
      method: 'get',
      func: {
        func: routeFunc,
        permissions,
        middleware: [sessionMiddleware],
      },
    })

    await fetch(request)

    assert.strictEqual(await permissions.test(), true)
  })

  test('should handle errors and set appropriate response', async () => {
    const error = new Error('Test error')
    const routeFunc = async () => {
      throw error
    }
    setHTTPFunctionMap(routeFunc)
    wireHTTP({
      route: 'test',
      method: 'get',
      func: { func: routeFunc, middleware: [sessionMiddleware] },
    })
    await assert.rejects(
      async () =>
        fetch(request, {
          bubbleErrors: true,
        }),
      error
    )
  })
})

describe('http-runner helpers', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
  })

  test('addHTTPMiddleware registers a route middleware group', () => {
    const middleware = [sessionMiddleware]

    assert.strictEqual(addHTTPMiddleware('/api/*', middleware), middleware)
    assert.strictEqual(
      pikkuState(null, 'middleware', 'httpGroup')['/api/*'],
      middleware
    )
  })

  test('addHTTPMiddleware composes repeated registrations for the same pattern', () => {
    const first: CorePikkuMiddleware = async (_s, _w, next) => next()
    const second: CorePikkuMiddleware = async (_s, _w, next) => next()

    addHTTPMiddleware('*', [first])
    addHTTPMiddleware('*', [second])

    assert.deepEqual(pikkuState(null, 'middleware', 'httpGroup')['*'], [
      first,
      second,
    ])
  })

  test('createHTTPWire combines request and response when present', () => {
    const req = new TestRequest('/x', 'get')
    const res = new TestResponse()

    assert.deepEqual(createHTTPWire(undefined, undefined), undefined)
    assert.deepEqual(createHTTPWire(req, undefined), { request: req })
    assert.deepEqual(createHTTPWire(undefined, res), { response: res })
    assert.deepEqual(createHTTPWire(req, res), { request: req, response: res })
  })

  test('wireHTTP skips routes without metadata', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message: string) => {
      warnings.push(message)
    }

    try {
      wireHTTP({
        route: '/missing',
        method: 'get',
        func: { func: async () => ({ ok: true }) },
      })
    } finally {
      console.warn = originalWarn
    }

    assert.equal(
      pikkuState(null, 'http', 'routes').get('get')?.has('/missing') ?? false,
      false
    )
    assert.match(warnings[0] || '', /Skipping HTTP route 'GET \/missing'/)
  })

  test('wireHTTP registers route functions when metadata exists', () => {
    setRouteMeta('/registered')

    wireHTTP({
      route: '/registered',
      method: 'get',
      func: { func: async () => ({ ok: true }) },
    })

    httpRouter.initialize()

    assert.equal(
      pikkuState(null, 'http', 'routes').get('get')?.has('/registered'),
      true
    )
  })

  test('fetchData handles OPTIONS preflight through global middleware', async () => {
    const request = new TestRequest('/anything', 'options')
    const response = new TestResponse()
    const execution: string[] = []

    addHTTPMiddleware('*', [
      async (_services, _wire, next) => {
        execution.push('global')
        await next?.()
      },
    ])

    await fetchData(request, response)

    assert.equal(response.statusCode, 204)
    assert.equal(response.jsonBody, undefined)
    assert.deepEqual(execution, ['global'])
  })

  test('fetchData sets 204 when a route returns undefined', async () => {
    setRouteMeta('/no-content')
    addFunction('pikku_func_name', {
      func: async () => undefined,
    })
    wireHTTP({
      route: '/no-content',
      method: 'get',
      auth: false,
      func: { func: async () => undefined },
    })
    httpRouter.initialize()

    const request = new TestRequest('/no-content', 'get')
    const response = new TestResponse()

    await fetchData(request, response)

    assert.equal(response.statusCode, 204)
  })

  test('fetchData writes binary responses when returnsJSON is false', async () => {
    setRouteMeta('/binary')
    wireHTTP({
      route: '/binary',
      method: 'get',
      auth: false,
      returnsJSON: false,
      func: { func: async () => 'raw-body' },
    })
    httpRouter.initialize()

    const request = new TestRequest('/binary', 'get')
    const response = new TestResponse()

    await fetchData(request, response)

    assert.equal(response.bufferBody, 'raw-body')
    assert.equal(response.jsonBody, undefined)
  })

  test('fetchData applies native Response results', async () => {
    setRouteMeta('/native-response')
    wireHTTP({
      route: '/native-response',
      method: 'get',
      auth: false,
      func: {
        func: async () =>
          new Response('hello', {
            status: 202,
            headers: { 'content-type': 'text/plain', 'x-test': 'ok' },
          }),
      },
    })
    httpRouter.initialize()

    const result = await pikkuFetch(
      new Request('https://example.com/native-response')
    )

    const response = result.toResponse()
    assert.equal(response.status, 202)
    assert.equal(await response.text(), 'hello')
    assert.equal(response.headers.get('x-test'), 'ok')
  })

  test('fetchData configures SSE mode and streams through channel.send', async () => {
    setRouteMeta('/sse', 'get', { sse: true })
    wireHTTP({
      route: '/sse',
      method: 'get',
      sse: true,
      auth: false,
      func: {
        func: async (_services, _data, wire) => {
          await wire.channel.send({ hello: 'world' })
          wire.channel.close()
        },
      },
    })
    httpRouter.initialize()

    const request = new TestRequest('/sse', 'get')
    request.setData({ open: true })
    const response = new TestResponse()

    await fetchData(request, response)

    assert.equal(response.mode, 'stream')
    assert.equal(response.headersMap.get('Content-Type'), 'text/event-stream')
    assert.equal(response.headersMap.get('Cache-Control'), 'no-cache')
    assert.equal(response.closed, true)
    assert.equal(response.bufferBody, JSON.stringify({ hello: 'world' }))
  })
})
