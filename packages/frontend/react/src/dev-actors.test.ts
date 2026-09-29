/**
 * Run: node --test packages/frontend/react/src/dev-actors.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { signInAsPersona } from './dev-actors.ts'

test('signInAsPersona posts only the persona id to the persona endpoint', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return { ok: true, status: 200 } as Response
  }) as unknown as typeof fetch

  try {
    await signInAsPersona({ apiUrl: 'http://localhost:5003/api', id: 'admin' })
  } finally {
    globalThis.fetch = original
  }

  assert.ok(seen)
  const { url, init } = seen as { url: string; init: RequestInit }
  assert.equal(url, 'http://localhost:5003/api/auth/sign-in/persona')
  assert.equal(init.method, 'POST')
  // Cookies must ride the request — the whole point is the session it sets.
  assert.equal(init.credentials, 'include')
  assert.deepEqual(JSON.parse(init.body as string), { id: 'admin' })
})

test('signInAsPersona throws on a refused sign-in', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch
  try {
    await assert.rejects(
      signInAsPersona({ apiUrl: 'http://localhost:5003/api', id: 'admin' }),
      /401/
    )
  } finally {
    globalThis.fetch = original
  }
})
