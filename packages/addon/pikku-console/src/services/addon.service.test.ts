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

  // A registry without the categories route matches the by-id/by-name route
  // instead, which answers 204 with no body at all.
  const mockNoContent = () => {
    globalThis.fetch = (async (url: string | URL) => {
      calls.push(String(url))
      return {
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
        text: async () => '',
      } as unknown as Response
    }) as typeof globalThis.fetch
  }

  test('readAddonsMeta queries the fabric registry packages endpoint', async () => {
    mockFetch({ packages: [{ id: 'a' }], total: 12, nextCursor: 50 })
    const service = new AddonService(FABRIC)
    const result = await service.readAddonsMeta()
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].startsWith(`${FABRIC}/registry/packages`),
      `expected fabric /registry/packages, got ${calls[0]}`
    )
    assert.deepEqual(result, {
      packages: [{ id: 'a' }],
      total: 12,
      nextCursor: 50,
    })
  })

  test('readAddonsMeta defaults the page size and omits an absent cursor', async () => {
    mockFetch({ packages: [] })
    const service = new AddonService(FABRIC)
    const result = await service.readAddonsMeta()
    const params = new URL(calls[0]).searchParams
    assert.equal(params.get('limit'), '50')
    assert.equal(params.get('cursor'), null)
    // A registry that answers without paging fields still has to produce a
    // well-formed page, or the console's cursor walk never terminates.
    assert.deepEqual(result, { packages: [], total: 0, nextCursor: null })
  })

  test('readAddonsMeta forwards the cursor and limit it is given', async () => {
    mockFetch({ packages: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readAddonsMeta({ cursor: 250, limit: 250 })
    const params = new URL(calls[0]).searchParams
    assert.equal(params.get('cursor'), '250')
    assert.equal(params.get('limit'), '250')
  })

  test('readAddonsMeta forwards search, category, sort and official to the registry', async () => {
    mockFetch({ packages: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readAddonsMeta({
      search: 'slack',
      category: 'messaging',
      sort: 'functions',
      official: true,
    })
    const params = new URL(calls[0]).searchParams
    // The registry calls free-text `query`, the console calls it `search`.
    assert.equal(params.get('query'), 'slack')
    assert.equal(params.get('search'), null)
    assert.equal(params.get('category'), 'messaging')
    assert.equal(params.get('sort'), 'functions')
    assert.equal(params.get('official'), 'true')
  })

  test('readAddonsMeta omits the filters it was not given', async () => {
    mockFetch({ packages: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readAddonsMeta({ official: false })
    const params = new URL(calls[0]).searchParams
    assert.equal(params.get('query'), null)
    assert.equal(params.get('category'), null)
    assert.equal(params.get('sort'), null)
    assert.equal(params.get('official'), null)
    assert.equal(params.get('names'), null)
  })

  test('readAddonsMeta sends an empty names list rather than dropping it', async () => {
    mockFetch({ packages: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readAddonsMeta({ names: '' })
    const params = new URL(calls[0]).searchParams
    // Dropping it would make "Installed" with nothing installed fall back to
    // the whole catalogue.
    assert.equal(params.get('names'), '')
  })

  test('readAddonsMeta forwards a populated names list', async () => {
    mockFetch({ packages: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readAddonsMeta({ names: '@pikku/addon-slack,@acme/addon-x' })
    const params = new URL(calls[0]).searchParams
    assert.equal(params.get('names'), '@pikku/addon-slack,@acme/addon-x')
  })

  test('readAddonCategories queries the catalogue-wide categories endpoint', async () => {
    mockFetch({ messaging: 12, storage: 3 })
    const service = new AddonService(FABRIC)
    const result = await service.readAddonCategories()
    assert.equal(calls[0], `${FABRIC}/registry/packages/categories`)
    assert.deepEqual(result, { messaging: 12, storage: 3 })
  })

  test('readAddonCategories degrades to no counts on an empty 204 body', async () => {
    mockNoContent()
    const service = new AddonService(FABRIC)
    assert.deepEqual(await service.readAddonCategories(), {})
  })

  test('readAddonCategories throws when the registry errors', async () => {
    mockFetch({}, false)
    const service = new AddonService(FABRIC)
    await assert.rejects(
      () => service.readAddonCategories(),
      /Registry returned 500/
    )
  })

  test('readOpenapiCategories queries the catalogue-wide categories endpoint', async () => {
    mockFetch({ payments: 7 })
    const service = new AddonService(FABRIC)
    const result = await service.readOpenapiCategories()
    assert.equal(calls[0], `${FABRIC}/registry/openapis/categories`)
    assert.deepEqual(result, { payments: 7 })
  })

  test('readOpenapiCategories degrades to no counts on an empty 204 body', async () => {
    mockNoContent()
    const service = new AddonService(FABRIC)
    assert.deepEqual(await service.readOpenapiCategories(), {})
  })

  test('readOpenapiCategories throws when the registry errors', async () => {
    mockFetch({}, false)
    const service = new AddonService(FABRIC)
    await assert.rejects(
      () => service.readOpenapiCategories(),
      /Registry returned 500/
    )
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

  test('readOpenapis forwards the category and paging window', async () => {
    mockFetch({ apis: [], total: 0, nextCursor: null })
    const service = new AddonService(FABRIC)
    await service.readOpenapis({
      limit: 50,
      offset: 100,
      category: 'payments',
    })
    const params = new URL(calls[0]).searchParams
    assert.equal(params.get('category'), 'payments')
    assert.equal(params.get('limit'), '50')
    assert.equal(params.get('offset'), '100')
    assert.equal(params.get('query'), null)
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
