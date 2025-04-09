import { describe, test } from 'node:test'
import assert from 'assert'
import { PikkuFetchHTTPResponse } from './pikku-fetch-http-response.js' // Adjust path if needed

describe('PikkuFetchHTTPResponse', () => {
  test('sets status code', () => {
    const res = new PikkuFetchHTTPResponse().status(404).toResponse()
    assert.strictEqual(res.status, 404)
  })

  test('sets headers', async () => {
    const res = new PikkuFetchHTTPResponse()
      .header('X-Test', 'value')
      .header('X-Multi', ['a', 'b'])
      .toResponse()

    assert.strictEqual(res.headers.get('X-Test'), 'value')
    const multi = res.headers.get('X-Multi')?.split(', ')
    assert.deepEqual(multi, ['a', 'b'])
  })

  test('sets cookies', () => {
    const res = new PikkuFetchHTTPResponse()
      .cookie('token', 'abc123', { httpOnly: true, path: '/' })
      .cookie('other', 'val', { maxAge: 3600 })
      .toResponse()

    const setCookieHeader = res.headers.get('Set-Cookie')
    assert.ok(setCookieHeader)

    const cookies = setCookieHeader!.split(', ')
    assert.ok(cookies.some((c) => c.startsWith('token=abc123')))
    assert.ok(cookies.some((c) => c.startsWith('other=val')))
  })

  test('json sets correct content type and body', async () => {
    const res = new PikkuFetchHTTPResponse()
      .json({ hello: 'world' })
      .toResponse()

    assert.strictEqual(res.headers.get('Content-Type'), 'application/json')
    const body = await res.json()
    assert.deepEqual(body, { hello: 'world' })
  })

  test('text sets correct content type and body', async () => {
    const res = new PikkuFetchHTTPResponse().text('hello').toResponse()

    assert.strictEqual(res.headers.get('Content-Type'), 'text/plain')
    const text = await res.text()
    assert.strictEqual(text, 'hello')
  })

  test('html sets correct content type and body', async () => {
    const res = new PikkuFetchHTTPResponse().html('<p>hi</p>').toResponse()

    assert.strictEqual(res.headers.get('Content-Type'), 'text/html')
    const text = await res.text()
    assert.strictEqual(text, '<p>hi</p>')
  })

  test('arrayBuffer sets correct content type', async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const res = new PikkuFetchHTTPResponse().arrayBuffer(buffer).toResponse()

    assert.strictEqual(
      res.headers.get('Content-Type'),
      'application/octet-stream'
    )
    const body = await res.arrayBuffer()
    assert.deepEqual(new Uint8Array(body), new Uint8Array([1, 2, 3]))
  })

  test('redirect sets Location header and status', () => {
    const res = new PikkuFetchHTTPResponse()
      .redirect('/login', 301)
      .toResponse()

    assert.strictEqual(res.status, 301)
    assert.strictEqual(res.headers.get('Location'), '/login')
  })
})
