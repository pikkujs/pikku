import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createSessionRefresh } from './session-refresh.js'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const stubFetch = (respond: () => Promise<Response>) => {
  const urls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return respond()
  }) as typeof fetch
  return urls
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('refreshSessionCookie', () => {
  test('asks Better Auth to skip its cookie cache, on the app API base', async () => {
    const urls = stubFetch(() => json({ user: { id: 'u1' } }))
    const { refreshSessionCookie } = createSessionRefresh({
      apiUrl: () => 'http://api.test/api',
    })
    assert.equal(await refreshSessionCookie(), true)
    assert.deepEqual(urls, [
      'http://api.test/api/auth/get-session?disableCookieCache=true',
    ])
  })

  test('a signed-out null body is false, not an error', async () => {
    stubFetch(() => json(null))
    const { refreshSessionCookie } = createSessionRefresh({
      apiUrl: () => '/api',
    })
    assert.equal(await refreshSessionCookie(), false)
  })

  test('a failed request never throws', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    const { refreshSessionCookie } = createSessionRefresh({
      apiUrl: () => '/api',
    })
    assert.equal(await refreshSessionCookie(), false)
  })

  test('concurrent callers share one request', async () => {
    const urls = stubFetch(() => json({ user: { id: 'u1' } }))
    const { refreshSessionCookie } = createSessionRefresh({
      apiUrl: () => '/api',
    })
    await Promise.all([refreshSessionCookie(), refreshSessionCookie()])
    assert.equal(urls.length, 1)
  })

  test('starting outside a browser is a no-op', () => {
    const { startSessionRefresh, stopSessionRefresh } = createSessionRefresh({
      apiUrl: () => '/api',
    })
    startSessionRefresh()
    stopSessionRefresh()
  })
})
