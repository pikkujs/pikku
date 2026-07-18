import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { httpRequest } from './http-request.function.js'

type Captured = { url: string; headers: Record<string, string> }

let captured: Captured | undefined
const realFetch = globalThis.fetch

const secrets = {
  getSecret: async (key: string) => {
    const store: Record<string, string> = {
      'my-token': 'sk-abc123',
      'basic-cred': 'alice:s3cret',
    }
    if (!(key in store)) throw new Error(`Secret "${key}" not found`)
    return store[key]
  },
}

const call = (data: any) => (httpRequest as any).func({ secrets }, data)

beforeEach(() => {
  captured = undefined
  globalThis.fetch = (async (url: any, opts: any) => {
    captured = {
      url: url.toString(),
      headers: { ...(opts?.headers ?? {}) },
    }
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    } as any
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('graph:httpRequest auth injection', () => {
  test('no auth descriptor behaves as before — no Authorization header', async () => {
    await call({ method: 'GET', url: 'https://api.test/thing' })
    assert.equal(captured!.url, 'https://api.test/thing')
    assert.equal(captured!.headers['Authorization'], undefined)
  })

  test('bearer mode injects Authorization: Bearer <secret>', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      auth: { mode: 'bearer', credential: 'my-token' },
    })
    assert.equal(captured!.headers['Authorization'], 'Bearer sk-abc123')
  })

  test('apiKeyHeader mode uses the given header name with the raw secret', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      auth: {
        mode: 'apiKeyHeader',
        credential: 'my-token',
        headerName: 'X-API-Key',
      },
    })
    assert.equal(captured!.headers['X-API-Key'], 'sk-abc123')
    assert.equal(captured!.headers['Authorization'], undefined)
  })

  test('apiKeyHeader defaults the header name to Authorization', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      auth: { mode: 'apiKeyHeader', credential: 'my-token' },
    })
    assert.equal(captured!.headers['Authorization'], 'sk-abc123')
  })

  test('apiKeyQuery mode appends the secret as a query param', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      auth: {
        mode: 'apiKeyQuery',
        credential: 'my-token',
        queryName: 'api_key',
      },
    })
    assert.match(captured!.url, /[?&]api_key=sk-abc123/)
  })

  test('basic mode base64-encodes user:pass into Authorization: Basic', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      auth: { mode: 'basic', credential: 'basic-cred' },
    })
    const expected = 'Basic ' + Buffer.from('alice:s3cret').toString('base64')
    assert.equal(captured!.headers['Authorization'], expected)
  })

  test('extraHeaders are merged and never overwrite an explicit user header', async () => {
    await call({
      method: 'GET',
      url: 'https://api.test/thing',
      headers: { 'Notion-Version': '2099-01-01' },
      auth: {
        mode: 'bearer',
        credential: 'my-token',
        extraHeaders: { 'Notion-Version': '2022-06-28' },
      },
    })
    assert.equal(captured!.headers['Notion-Version'], '2099-01-01')
    assert.equal(captured!.headers['Authorization'], 'Bearer sk-abc123')
  })

  test('a missing secret throws an error naming the credential', async () => {
    await assert.rejects(
      call({
        method: 'GET',
        url: 'https://api.test/thing',
        auth: { mode: 'bearer', credential: 'not-provisioned' },
      }),
      /not-provisioned/
    )
  })

  test('oauth2 mode throws a clear not-yet-supported error', async () => {
    await assert.rejects(
      call({
        method: 'GET',
        url: 'https://api.test/thing',
        auth: { mode: 'oauth2', credential: 'my-token' },
      }),
      /OAuth2/i
    )
  })
})
