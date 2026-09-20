import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getOpenApi,
  getPackage,
  registryId,
  searchOpenApis,
  searchPackages,
} from './registry.js'

const API = 'https://api.example.test'

/** Swap global fetch for one that records the URL and answers with `reply`. */
function stubFetch(reply: (url: string) => Response) {
  const seen: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    return reply(url)
  }) as typeof fetch
  return { seen, restore: () => (globalThis.fetch = original) }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })

describe('registryId', () => {
  // Every one of these spellings appears in the wild, and two of them are what
  // the search output itself prints.
  test('every spelling of an addon reaches the same id', () => {
    for (const spelling of [
      'gmail',
      'addon-gmail',
      'pikku-addon-gmail',
      '@pikku/addon-gmail',
      'Gmail',
    ]) {
      assert.equal(registryId(spelling), 'pikku-addon-gmail')
    }
  })

  test('a name with nothing usable in it is not an id', () => {
    assert.equal(registryId('@pikku/addon-'), null)
    assert.equal(registryId(''), null)
  })

  test('punctuation collapses to hyphens rather than being dropped', () => {
    assert.equal(registryId('Acme CRM'), 'pikku-addon-acme-crm')
  })
})

describe('reads', () => {
  test('a 404 is an answer, not a failure', async () => {
    const f = stubFetch(() => new Response('', { status: 404 }))
    try {
      assert.equal(await getPackage(API, 'nope'), null)
      assert.equal(await getOpenApi(API, 'nope'), null)
    } finally {
      f.restore()
    }
  })

  test('a 500 throws, so an outage is not reported as an empty catalogue', async () => {
    const f = stubFetch(() => new Response('boom', { status: 500 }))
    try {
      await assert.rejects(() => getPackage(API, 'gmail'), /500/)
    } finally {
      f.restore()
    }
  })

  test('a package lookup normalises the name into the path', async () => {
    const f = stubFetch(() => json({ name: 'gmail' }))
    try {
      await getPackage(API, '@pikku/addon-gmail')
      assert.match(f.seen[0]!, /\/registry\/addons\/pikku-addon-gmail$/)
    } finally {
      f.restore()
    }
  })

  test('searching packages returns the array the registry sends', async () => {
    const f = stubFetch(() => json([{ name: 'stripe' }]))
    try {
      assert.deepEqual(await searchPackages(API, 'pay'), [{ name: 'stripe' }])
      assert.match(f.seen[0]!, /\/registry\/addons\/search\?query=pay$/)
    } finally {
      f.restore()
    }
  })

  test('searching openapis unwraps `apis` and carries the limit', async () => {
    const f = stubFetch(() => json({ apis: [{ name: 'stripe.com' }] }))
    try {
      const apis = await searchOpenApis(API, 'pay', 5)
      assert.deepEqual(apis, [{ name: 'stripe.com' }])
      assert.match(f.seen[0]!, /limit=5/)
      assert.match(f.seen[0]!, /query=pay/)
    } finally {
      f.restore()
    }
  })

  // An empty body with a 200 is what the registry returns for a soft miss on
  // some routes; parsing it as JSON would throw where null is the answer.
  test('an empty 200 body is null, not a parse error', async () => {
    const f = stubFetch(() => new Response('', { status: 200 }))
    try {
      assert.equal(await getOpenApi(API, 'stripe.com'), null)
    } finally {
      f.restore()
    }
  })
})
