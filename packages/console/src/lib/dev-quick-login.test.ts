import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isLocalServerUrl,
  fetchDevQuickLoginStatus,
  postDevQuickLogin,
} from './dev-quick-login.js'

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('isLocalServerUrl accepts loopback hosts only', () => {
  assert.equal(isLocalServerUrl('http://localhost:7071'), true)
  assert.equal(isLocalServerUrl('http://127.0.0.1:3000'), true)
  assert.equal(isLocalServerUrl('http://[::1]:3000'), true)
  assert.equal(isLocalServerUrl('https://app.example.com'), false)
  assert.equal(isLocalServerUrl('not a url'), false)
})

test('fetchDevQuickLoginStatus skips non-local servers without fetching', async () => {
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return new Response('{}')
  }) as typeof fetch
  const status = await fetchDevQuickLoginStatus('https://app.example.com')
  assert.equal(status, null)
  assert.equal(called, false)
})

test('fetchDevQuickLoginStatus returns the status from the endpoint', async () => {
  const requests: string[] = []
  globalThis.fetch = (async (input: any) => {
    requests.push(String(input))
    return Response.json({ enabled: true, email: 'admin@pikku.dev' })
  }) as typeof fetch
  const status = await fetchDevQuickLoginStatus('http://localhost:7071/')
  assert.deepEqual(status, { enabled: true, email: 'admin@pikku.dev' })
  assert.deepEqual(requests, ['http://localhost:7071/api/auth/dev/quick-login'])
})

test('fetchDevQuickLoginStatus returns null on 404 or network errors', async () => {
  globalThis.fetch = (async () =>
    new Response('Not Found', { status: 404 })) as typeof fetch
  assert.equal(await fetchDevQuickLoginStatus('http://localhost:7071'), null)

  globalThis.fetch = (async () => {
    throw new Error('connection refused')
  }) as typeof fetch
  assert.equal(await fetchDevQuickLoginStatus('http://localhost:7071'), null)
})

test('postDevQuickLogin posts with credentials and throws on failure', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return Response.json({ user: {} })
  }) as typeof fetch
  await postDevQuickLogin('http://localhost:7071')
  assert.equal(calls[0]!.url, 'http://localhost:7071/api/auth/dev/quick-login')
  assert.equal(calls[0]!.init?.method, 'POST')
  assert.equal(calls[0]!.init?.credentials, 'include')
  assert.equal(
    (calls[0]!.init?.headers as Record<string, string>)['content-type'],
    'application/json'
  )

  globalThis.fetch = (async () =>
    new Response('nope', { status: 401 })) as typeof fetch
  await assert.rejects(() => postDevQuickLogin('http://localhost:7071'))
})
