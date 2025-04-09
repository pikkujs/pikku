import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request'

const createRequest = (method, url, body, headers = {}) => {
  return new Request(url, {
    method,
    headers,
    body:
      method === 'POST'
        ? typeof body === 'string'
          ? body
          : JSON.stringify(body)
        : undefined,
  })
}

test('method() returns lowercase HTTP method', () => {
  const req = createRequest('POST', 'http://localhost/test', null)
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.equal(pikkuReq.method(), 'post')
})

test('path() returns pathname only', () => {
  const req = createRequest('GET', 'http://localhost/foo/bar?x=1', null)
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.equal(pikkuReq.path(), '/foo/bar')
})

test('header() retrieves headers case-insensitively', () => {
  const req = createRequest('GET', 'http://localhost', null, {
    'Content-Type': 'application/json',
  })
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.equal(pikkuReq.header('content-type'), 'application/json')
})

test('cookie() parses cookies correctly', () => {
  const req = createRequest('GET', 'http://localhost', null, {
    Cookie: 'session=abc; user=test',
  })
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.equal(pikkuReq.cookie('session'), 'abc')
  assert.equal(pikkuReq.cookie('user'), 'test')
  assert.equal(pikkuReq.cookie('missing'), null)
})

test('params() and setParams()', () => {
  const req = createRequest('GET', 'http://localhost', null)
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.deepEqual(pikkuReq.params(), {})
  pikkuReq.setParams({ id: '123' })
  assert.deepEqual(pikkuReq.params(), { id: '123' })
})

test('query() parses URL search params', () => {
  const req = createRequest('GET', 'http://localhost?x=1&y=2', null)
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  assert.equal(pikkuReq.query().x, '1')
  assert.equal(pikkuReq.query().y, '2')
})

test('data() merges json body, query, and params', async () => {
  const req = createRequest(
    'POST',
    'http://localhost/test?a=5',
    { foo: 'bar' },
    { 'Content-Type': 'application/json' }
  )
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  pikkuReq.setParams({ id: '22' })
  const result = await pikkuReq.data()
  assert.deepEqual(result, { id: '22', a: '5', foo: 'bar' })
})

test('data() wraps string JSON body under data key', async () => {
  const req = createRequest('POST', 'http://localhost', '"hello"', {
    'Content-Type': 'application/json',
  })
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  const result = await pikkuReq.data()
  assert.deepEqual(result, { data: 'hello' })
})

test('data() handles text/plain correctly', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hello world',
  })
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  const result = await pikkuReq.data()
  assert.deepEqual(result, { data: 'hello world' })
})

test('data() returns arrayBuffer for unknown content-type', async () => {
  const buffer = Buffer.from('raw')
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
  })
  const pikkuReq = new PikkuFetchHTTPRequest<any>(req)
  const result = await pikkuReq.data()
  assert(result.data instanceof ArrayBuffer)
  const str = Buffer.from(result.data).toString()
  assert.equal(str, 'raw')
})

test('data() handles invalid JSON safely', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  })
  const pikkuReq = new PikkuFetchHTTPRequest(req)
  try {
    await pikkuReq.data()
    assert(false, 'Should have thrown')
  } catch (e) {
    assert(e.message.includes('Error parsing body'))
  }
})

test('data() parses application/x-www-form-urlencoded correctly', async () => {
  const formBody = 'name=Yasser&age=35&active=true'

  const req = new Request('http://localhost/form?ref=abc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  })

  const pikkuReq = new PikkuFetchHTTPRequest(req)
  pikkuReq.setParams({ userId: '999' })

  const result = await pikkuReq.data()

  assert.deepEqual(result, {
    userId: '999',
    ref: 'abc',
    name: 'Yasser',
    age: '35',
    active: 'true',
  })
})

// --- Compatible types

test('data() treats "123" and 123 as equivalent', async () => {
  const req = createRequest(
    'POST',
    'http://localhost?id=123',
    { id: 123 },
    {
      'Content-Type': 'application/json',
    }
  )

  const r = new PikkuFetchHTTPRequest(req)
  r.setParams({ id: '123' }) // All match
  const result = await r.data()
  assert.deepEqual(result, { id: '123' })
})

test('data() treats "true" and true as equivalent', async () => {
  const req = createRequest(
    'POST',
    'http://localhost?flag=true',
    { flag: true },
    {
      'Content-Type': 'application/json',
    }
  )

  const r = new PikkuFetchHTTPRequest(req)
  r.setParams({ flag: 'true' }) // All match
  const result = await r.data()
  assert.deepEqual(result, { flag: 'true' })
})

// --- Conflicts

test('data() throws on conflicting values', async () => {
  const req = createRequest(
    'POST',
    'http://localhost?foo=123',
    { foo: 456 },
    {
      'Content-Type': 'application/json',
    }
  )

  const r = new PikkuFetchHTTPRequest(req)
  r.setParams({ foo: '123' })

  await assert.rejects(async () => await r.data(), {
    message: 'Conflicting values for key "foo": "123" vs "456"',
  })
})

test('data() throws on boolean conflict', async () => {
  const req = createRequest(
    'POST',
    'http://localhost?debug=false',
    { debug: true },
    {
      'Content-Type': 'application/json',
    }
  )

  const r = new PikkuFetchHTTPRequest(req)
  r.setParams({})

  await assert.rejects(async () => await r.data(), {
    message: 'Conflicting values for key "debug": "false" vs "true"',
  })
})

// --- Safe fallback: only one source

test('data() works when only body has values', async () => {
  const req = createRequest(
    'POST',
    'http://localhost',
    { test: 'ok' },
    {
      'Content-Type': 'application/json',
    }
  )

  const r = new PikkuFetchHTTPRequest(req)
  const result = await r.data()
  assert.deepEqual(result, { test: 'ok' })
})
