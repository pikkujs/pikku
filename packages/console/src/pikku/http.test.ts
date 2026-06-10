import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pikku } from './http.js'

test('console RPCs invoke via HTTP /rpc/ path', async () => {
  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, body: JSON.parse((init?.body as string) ?? 'null') })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = pikku({ serverUrl: 'https://example.com/api' })
    const result = await client.rpc.invoke('console:getAllMeta')

    assert.deepEqual(result, { ok: true })
    assert.equal(calls.length, 1)
    assert.ok(calls[0].url.includes('/rpc/console:getAllMeta'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
