import assert from 'node:assert/strict'
import { describe, test, afterEach } from 'node:test'

import { CorePikkuFetch, PikkuFetchError } from './index.js'
import { corePikkuFetch } from './pikku-fetch.js'

describe('@pikku/fetch', () => {
  test('exports the public fetch client API', () => {
    assert.equal(typeof CorePikkuFetch, 'function')
    assert.equal(typeof PikkuFetchError, 'function')
  })

  test('keeps corePikkuFetch off the entrypoint', async () => {
    assert.equal(typeof corePikkuFetch, 'function')
    assert.equal(
      'corePikkuFetch' in (await import('./index.js')),
      false,
      'corePikkuFetch is an internal helper and must not be re-exported'
    )
  })
})

describe('CorePikkuFetch.setHeader', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const capture = () => {
    const seen: { headers?: Record<string, string> } = {}
    globalThis.fetch = (async (_input: any, init?: any) => {
      seen.headers = (init?.headers ?? {}) as Record<string, string>
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    return seen
  }

  test('sends a set header on every request', async () => {
    const seen = capture()
    const client = new CorePikkuFetch({ serverUrl: 'https://api.test' })
    client.setHeader('x-pikku-impersonate-user-id', 'u_guest')
    await client.fetch('/anything', 'GET', undefined)
    assert.equal(seen.headers?.['x-pikku-impersonate-user-id'], 'u_guest')
  })

  test('removes the header when set to null', async () => {
    const seen = capture()
    const client = new CorePikkuFetch({ serverUrl: 'https://api.test' })
    client.setHeader('x-pikku-impersonate-user-id', 'u_guest')
    client.setHeader('x-pikku-impersonate-user-id', null)
    await client.fetch('/anything', 'GET', undefined)
    assert.equal(seen.headers?.['x-pikku-impersonate-user-id'], undefined)
  })

  test('no header is sent by default (inherits the session)', async () => {
    const seen = capture()
    const client = new CorePikkuFetch({ serverUrl: 'https://api.test' })
    await client.fetch('/anything', 'GET', undefined)
    assert.equal(seen.headers?.['x-pikku-impersonate-user-id'], undefined)
  })
})

describe('CorePikkuFetch.uploadFile', () => {
  const upload = {
    uploadUrl: '/upload/shop/item-1/photo.png?signature=abc',
    fileKey: 'item-1/photo.png',
  }

  const client = (
    serverUrl: string | undefined,
    response: () => Response = () => new Response(null, { status: 200 })
  ) => {
    const calls: { url: string; init: RequestInit }[] = []
    const pikku = new CorePikkuFetch({
      serverUrl,
      authHeaders: { jwt: 'session-token' },
      fetch: (async (input: any, init: any) => {
        calls.push({ url: String(input), init })
        return response()
      }) as typeof fetch,
    })
    return { pikku, calls }
  }

  test('resolves a relative URL against the server URL', async () => {
    const { pikku, calls } = client('https://shop.test')

    const { fileKey } = await pikku.uploadFile(upload, new Blob(['x']))

    assert.equal(
      calls[0]!.url,
      'https://shop.test/upload/shop/item-1/photo.png?signature=abc'
    )
    assert.equal(fileKey, 'item-1/photo.png')
  })

  test('keeps a path on the server URL', async () => {
    const { pikku, calls } = client('/api')

    await pikku.uploadFile(upload, new Blob(['x']))

    assert.equal(
      calls[0]!.url,
      '/api/upload/shop/item-1/photo.png?signature=abc'
    )
  })

  test('leaves an absolute URL alone, with no server URL needed', async () => {
    const { pikku, calls } = client(undefined)
    const uploadUrl = 'https://storage.test/put?signature=abc'

    await pikku.uploadFile({ ...upload, uploadUrl }, new Blob(['x']))

    assert.equal(calls[0]!.url, uploadUrl)
  })

  test('refuses a relative URL with no server URL', async () => {
    const { pikku, calls } = client(undefined)

    await assert.rejects(
      () => pikku.uploadFile(upload, new Blob(['x'])),
      /Server url is not set/
    )
    assert.equal(calls.length, 0)
  })

  test('sends the file as the body, with the upload headers and no session', async () => {
    const { pikku, calls } = client('https://shop.test')
    const file = new Blob(['x'])

    await pikku.uploadFile(
      {
        ...upload,
        uploadMethod: 'POST',
        uploadHeaders: { 'X-Upload': 'yes' },
      },
      file,
      'image/png'
    )

    assert.equal(calls[0]!.init.method, 'POST')
    assert.equal(calls[0]!.init.body, file)
    assert.deepEqual(calls[0]!.init.headers, {
      'X-Upload': 'yes',
      'Content-Type': 'image/png',
    })
  })

  test('surfaces a failed response', async () => {
    const { pikku } = client(
      'https://shop.test',
      () =>
        new Response(
          JSON.stringify({ name: 'PayloadTooLarge', message: 'Too big' }),
          { status: 413 }
        )
    )

    await assert.rejects(
      () => pikku.uploadFile(upload, new Blob(['x'])),
      (error: PikkuFetchError) => {
        assert.ok(error instanceof PikkuFetchError)
        assert.equal(error.status, 413)
        assert.equal(error.name, 'PayloadTooLarge')
        assert.equal(error.message, 'Too big')
        return true
      }
    )
  })
})
