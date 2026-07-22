import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { AddonService } from './addon.service.js'

const FABRIC = 'https://fabric.example'

describe('AddonService', () => {
  let calls: string[]
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    calls = []
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockFetch = (body: unknown, ok = true) => {
    globalThis.fetch = (async (url: string | URL) => {
      calls.push(String(url))
      return {
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response
    }) as typeof globalThis.fetch
  }

  test('readAddonsMeta queries the fabric registry packages endpoint', async () => {
    mockFetch({ packages: [{ id: 'a' }] })
    const service = new AddonService(FABRIC)
    const result = await service.readAddonsMeta()
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].startsWith(`${FABRIC}/registry/packages`),
      `expected fabric /registry/packages, got ${calls[0]}`
    )
    assert.deepEqual(result, [{ id: 'a' }])
  })

  test('readAddon queries the fabric registry package-by-id endpoint', async () => {
    mockFetch({ id: 'pkg-1', name: '@x/y' })
    const service = new AddonService(FABRIC)
    const result = await service.readAddon('pkg-1')
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].startsWith(`${FABRIC}/registry/packages/pkg-1`),
      `expected fabric /registry/packages/:id, got ${calls[0]}`
    )
    assert.deepEqual(result, { id: 'pkg-1', name: '@x/y' })
  })

  test('readOpenapis queries the fabric registry openapis endpoint', async () => {
    mockFetch({ apis: [{ name: 'stripe' }], total: 1, nextCursor: null })
    const service = new AddonService(FABRIC)
    const result = await service.readOpenapis({
      limit: 50,
      offset: 0,
      search: 'stripe',
    })
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].startsWith(`${FABRIC}/registry/openapis`),
      `expected fabric /registry/openapis, got ${calls[0]}`
    )
    assert.ok(
      calls[0].includes('query=stripe'),
      `expected query param, got ${calls[0]}`
    )
    assert.deepEqual(result, {
      apis: [{ name: 'stripe' }],
      total: 1,
      nextCursor: null,
    })
  })

  test('readOpenapiDetail queries the fabric registry openapi-by-name endpoint', async () => {
    mockFetch({ name: 'stripe', title: 'Stripe' })
    const service = new AddonService(FABRIC)
    const result = await service.readOpenapiDetail('stripe')
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].startsWith(`${FABRIC}/registry/openapis/stripe`),
      `expected fabric /registry/openapis/:name, got ${calls[0]}`
    )
    assert.deepEqual(result, { name: 'stripe', title: 'Stripe' })
  })
})
