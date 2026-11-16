import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PikkuFetchHTTPRequest } from './pikku-fetch-http-request'

const enc = new TextEncoder()

/** A request whose native `arrayBuffer` and stream reads are counted, to tell the two read paths apart. */
const spiedRequest = (
  body: string[],
  headers: Record<string, string>,
  { nativeBytes }: { nativeBytes?: Uint8Array } = {}
) => {
  const calls = { native: 0, stream: 0 }
  const all = enc.encode(body.join(''))
  const headerBag = new Headers(headers)
  const request = {
    url: 'http://localhost/x',
    method: 'POST',
    headers: headerBag,
    get body() {
      return new ReadableStream({
        start(controller) {
          calls.stream++
          for (const part of body) controller.enqueue(enc.encode(part))
          controller.close()
        },
      })
    },
    async arrayBuffer() {
      calls.native++
      return (nativeBytes ?? all).slice().buffer
    },
  } as unknown as Request
  return { request, calls }
}

const read = async (
  request: Request,
  maxBodySize = 1024,
  trustedFraming = true
) => {
  const wrapped = new PikkuFetchHTTPRequest(request, {
    maxBodySize,
    trustedFraming,
  })
  return new TextDecoder().decode(await wrapped.arrayBuffer())
}

describe('request body read path', () => {
  test('trustedFraming is off by default: the bounded reader is used', async () => {
    const { request, calls } = spiedRequest(['{"a":1}'], {
      'content-length': '7',
    })
    const wrapped = new PikkuFetchHTTPRequest(request)
    assert.equal(
      new TextDecoder().decode(await wrapped.arrayBuffer()),
      '{"a":1}'
    )
    assert.deepEqual(calls, { native: 0, stream: 1 })
  })

  test('trustedFraming false is the bounded reader and still enforces the limit', async () => {
    const { request, calls } = spiedRequest(['x'.repeat(64)], {
      'content-length': '4',
    })
    await assert.rejects(() => read(request, 16, false), {
      name: 'PayloadTooLargeError',
    })
    assert.equal(calls.native, 0)
  })

  test('a numeric content-length within the limit is read natively', async () => {
    const { request, calls } = spiedRequest(['{"a":1}'], {
      'content-length': '7',
    })
    assert.equal(await read(request), '{"a":1}')
    assert.deepEqual(calls, { native: 1, stream: 0 })
  })

  test('a missing content-length uses the bounded reader', async () => {
    const { request, calls } = spiedRequest(['{"a":1}'], {})
    assert.equal(await read(request), '{"a":1}')
    assert.equal(calls.native, 0)
    assert.equal(calls.stream, 1)
  })

  for (const value of ['abc', '+7', '0x7', '-7', '7, 7', '1e1', '']) {
    test(`content-length ${JSON.stringify(value)} uses the bounded reader`, async () => {
      const { request, calls } = spiedRequest(['{"a":1}'], {
        'content-length': value,
      })
      assert.equal(await read(request), '{"a":1}')
      assert.equal(calls.native, 0)
    })
  }

  test('transfer-encoding forces the bounded reader even with a content-length', async () => {
    const { request, calls } = spiedRequest(['{"a":1}'], {
      'content-length': '7',
      'transfer-encoding': 'chunked',
    })
    assert.equal(await read(request), '{"a":1}')
    assert.equal(calls.native, 0)
  })

  test('a content-length over the limit is refused with 413 before any read', async () => {
    const { request, calls } = spiedRequest(['x'], { 'content-length': '2000' })
    await assert.rejects(() => read(request, 1024), {
      name: 'PayloadTooLargeError',
    })
    assert.deepEqual(calls, { native: 0, stream: 0 })
  })

  test('a content-length of exactly the limit is read natively', async () => {
    const { request, calls } = spiedRequest(['x'.repeat(16)], {
      'content-length': '16',
    })
    assert.equal(await read(request, 16), 'x'.repeat(16))
    assert.equal(calls.native, 1)
  })

  test('a body larger than its declared content-length is refused after the read', async () => {
    const { request, calls } = spiedRequest(['x'.repeat(64)], {
      'content-length': '4',
    })
    await assert.rejects(() => read(request, 16), {
      name: 'PayloadTooLargeError',
    })
    assert.equal(calls.native, 1)
  })

  test('a chunked body over the limit is refused by the bounded reader', async () => {
    const { request } = spiedRequest(['x'.repeat(10), 'y'.repeat(10)], {
      'transfer-encoding': 'chunked',
    })
    await assert.rejects(() => read(request, 16), {
      name: 'PayloadTooLargeError',
    })
  })

  test('both paths return identical bytes', async () => {
    const payload = JSON.stringify({ n: 'héllo wörld ✓', list: [1, 2, 3] })
    const length = String(enc.encode(payload).byteLength)
    const fast = spiedRequest([payload], { 'content-length': length })
    const bounded = spiedRequest([payload], {})
    assert.equal(await read(fast.request), await read(bounded.request))
    assert.equal(fast.calls.native, 1)
    assert.equal(bounded.calls.stream, 1)
  })

  test('data() parses JSON through the native path', async () => {
    const { request, calls } = spiedRequest(['{"a":1}'], {
      'content-length': '7',
      'content-type': 'application/json',
    })
    const wrapped = new PikkuFetchHTTPRequest<any>(request, {
      trustedFraming: true,
    })
    assert.deepEqual(await wrapped.data(), { a: 1 })
    assert.equal(calls.native, 1)
  })

  test('a zero content-length is read natively and is empty', async () => {
    const { request, calls } = spiedRequest([''], { 'content-length': '0' })
    assert.equal(await read(request), '')
    assert.equal(calls.native, 1)
  })
})
