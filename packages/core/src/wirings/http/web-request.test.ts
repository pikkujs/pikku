import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toWebRequest, applyWebResponse } from './web-request.js'
import type {
  PikkuHTTPRequest,
  PikkuHTTPResponse,
  PikkuQuery,
} from './http.types.js'

const createMockRequest = (
  overrides: Partial<{
    method: string
    path: string
    headers: Record<string, string>
    query: Record<string, string>
    body: ArrayBuffer
  }> = {}
): PikkuHTTPRequest => ({
  method: () => (overrides.method ?? 'get') as any,
  path: () => overrides.path ?? '/test',
  headers: () => overrides.headers ?? {},
  header: (name: string) =>
    (overrides.headers ?? {})[name.toLowerCase()] ?? null,
  cookie: () => null,
  params: () => ({}),
  setParams: () => {},
  query: () => (overrides.query ?? {}) as PikkuQuery,
  json: async () => ({}),
  arrayBuffer: async () => overrides.body ?? new ArrayBuffer(0),
  data: async () => ({}) as any,
})

const createMockResponse = () => {
  const state = {
    statusCode: 0,
    headers: {} as Record<string, string | string[]>,
    body: null as string | null,
    redirectUrl: null as string | null,
    redirectStatus: null as number | null,
  }

  const res: PikkuHTTPResponse = {
    status(code: number) {
      state.statusCode = code
      return res
    },
    header(name: string, value: string | string[]) {
      state.headers[name.toLowerCase()] = value
      return res
    },
    cookie() {
      return res
    },
    json() {
      return res
    },
    arrayBuffer(data: any) {
      state.body = typeof data === 'string' ? data : null
      return res
    },
    redirect(location: string, status?: number) {
      state.redirectUrl = location
      state.redirectStatus = status ?? 302
      return res
    },
  }

  return { res, state }
}

describe('toWebRequest', () => {
  test('converts a GET request with correct URL and method', async () => {
    const req = createMockRequest({
      method: 'get',
      path: '/api/test',
      headers: { host: 'example.com' },
    })

    const webReq = toWebRequest(req)

    assert.equal(webReq.method, 'GET')
    assert.equal(new URL(webReq.url).pathname, '/api/test')
    assert.equal(new URL(webReq.url).host, 'example.com')
    assert.equal(webReq.body, null)
  })

  test('copies query parameters', async () => {
    const req = createMockRequest({
      query: { search: 'hello', page: '2' },
    })

    const webReq = toWebRequest(req)
    const url = new URL(webReq.url)

    assert.equal(url.searchParams.get('search'), 'hello')
    assert.equal(url.searchParams.get('page'), '2')
  })

  test('copies all headers', async () => {
    const req = createMockRequest({
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer abc123',
        host: 'localhost',
      },
    })

    const webReq = toWebRequest(req)

    assert.equal(webReq.headers.get('content-type'), 'application/json')
    assert.equal(webReq.headers.get('authorization'), 'Bearer abc123')
  })

  test('uses custom baseUrl when provided', async () => {
    const req = createMockRequest({ path: '/callback' })

    const webReq = toWebRequest(req, 'https://myapp.com')
    const url = new URL(webReq.url)

    assert.equal(url.origin, 'https://myapp.com')
    assert.equal(url.pathname, '/callback')
  })

  test('falls back to localhost when no host header', async () => {
    const req = createMockRequest({ path: '/test' })

    const webReq = toWebRequest(req)
    const url = new URL(webReq.url)

    assert.equal(url.host, 'localhost')
  })

  test('POST request includes streaming body', async () => {
    const bodyContent = JSON.stringify({
      username: 'admin',
      password: 'secret',
    })
    const encoder = new TextEncoder()
    const bodyBuffer = encoder.encode(bodyContent).buffer as ArrayBuffer

    const req = createMockRequest({
      method: 'post',
      path: '/signin',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: bodyBuffer,
    })

    const webReq = toWebRequest(req)

    assert.equal(webReq.method, 'POST')
    assert.notEqual(webReq.body, null)

    const text = await webReq.text()
    assert.equal(text, bodyContent)
  })

  test('GET request has no body', async () => {
    const req = createMockRequest({ method: 'get' })
    const webReq = toWebRequest(req)
    assert.equal(webReq.body, null)
  })

  test('HEAD request has no body', async () => {
    const req = createMockRequest({ method: 'head' })
    const webReq = toWebRequest(req)
    assert.equal(webReq.body, null)
  })

  test('OPTIONS request has no body', async () => {
    const req = createMockRequest({ method: 'options' })
    const webReq = toWebRequest(req)
    assert.equal(webReq.body, null)
  })
})

describe('applyWebResponse', () => {
  test('copies status code', async () => {
    const { res, state } = createMockResponse()
    const webRes = new Response('OK', { status: 201 })

    await applyWebResponse(res, webRes)

    assert.equal(state.statusCode, 201)
  })

  test('copies response headers', async () => {
    const { res, state } = createMockResponse()
    const webRes = new Response('', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'x-custom': 'value',
      },
    })

    await applyWebResponse(res, webRes)

    assert.equal(state.headers['content-type'], 'text/html')
    assert.equal(state.headers['x-custom'], 'value')
  })

  test('handles redirect via location header', async () => {
    const { res, state } = createMockResponse()
    const webRes = new Response(null, {
      status: 302,
      headers: { location: 'https://github.com/login/oauth/authorize' },
    })

    await applyWebResponse(res, webRes)

    assert.equal(state.redirectUrl, 'https://github.com/login/oauth/authorize')
    assert.equal(state.statusCode, 302)
  })

  test('writes text body', async () => {
    const { res, state } = createMockResponse()
    const webRes = new Response('{"session": true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await applyWebResponse(res, webRes)

    assert.equal(state.body, '{"session": true}')
  })

  test('does not write empty body', async () => {
    const { res, state } = createMockResponse()
    const webRes = new Response(null, { status: 204 })

    await applyWebResponse(res, webRes)

    assert.equal(state.body, null)
    assert.equal(state.statusCode, 204)
  })
})
