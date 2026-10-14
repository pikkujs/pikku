/**
 * Run: node --test packages/frontend/react/src/dev-actors.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listDevActors, signInAsVirtualUser } from './dev-actors.ts'

test('signInAsVirtualUser posts only the virtual user id to the virtual user endpoint', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return { ok: true, status: 200 } as Response
  }) as unknown as typeof fetch

  try {
    await signInAsVirtualUser({ apiUrl: 'http://localhost:5003/api', id: 'admin' })
  } finally {
    globalThis.fetch = original
  }

  assert.ok(seen)
  const { url, init } = seen as { url: string; init: RequestInit }
  assert.equal(url, 'http://localhost:5003/api/auth/sign-in/virtual-user')
  assert.equal(init.method, 'POST')
  // Cookies must ride the request — the whole point is the session it sets.
  assert.equal(init.credentials, 'include')
  assert.deepEqual(JSON.parse(init.body as string), { id: 'admin' })
})

test('signInAsVirtualUser throws on a refused sign-in', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch
  try {
    await assert.rejects(
      signInAsVirtualUser({ apiUrl: 'http://localhost:5003/api', id: 'admin' }),
      /401/
    )
  } finally {
    globalThis.fetch = original
  }
})

test('listDevActors asks the virtual user list for the app, and treats a refusal as nobody', async () => {
  const urls: string[] = []
  const original = globalThis.fetch
  let ok = true
  globalThis.fetch = (async (url: string) => {
    urls.push(url)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => ({
        actors: [{ id: 'admin', name: 'Admin', jobTitle: null }],
      }),
    } as Response
  }) as unknown as typeof fetch
  try {
    assert.deepEqual(await listDevActors({ apiUrl: '/api', app: 'web' }), [
      { id: 'admin', name: 'Admin', jobTitle: null },
    ])
    ok = false
    assert.deepEqual(await listDevActors({ apiUrl: '/api' }), [])
  } finally {
    globalThis.fetch = original
  }
  assert.deepEqual(urls, [
    '/api/auth/sign-in/virtual-users?app=web',
    '/api/auth/sign-in/virtual-users',
  ])
})
