import assert from 'node:assert/strict'
import { describe, test, afterEach } from 'node:test'

import { CorePikkuFetch, corePikkuFetch } from './index.js'

describe('@pikku/fetch', () => {
  test('exports the public fetch client API', () => {
    assert.equal(typeof CorePikkuFetch, 'function')
    assert.equal(typeof corePikkuFetch, 'function')
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
