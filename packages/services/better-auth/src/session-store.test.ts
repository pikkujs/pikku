import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { inMemorySessionStore, prefixedSessionStore } from './session-store.js'

describe('inMemorySessionStore', () => {
  test('getAndDelete returns the value once', async () => {
    const store = inMemorySessionStore()
    await store.set('k', 'v')
    assert.equal(await store.getAndDelete('k'), 'v')
    assert.equal(await store.getAndDelete('k'), null)
    assert.equal(await store.get('k'), null)
  })

  test('increment starts at one and counts up', async () => {
    const store = inMemorySessionStore()
    assert.equal(await store.increment('hits', 60), 1)
    assert.equal(await store.increment('hits', 60), 2)
    assert.equal(await store.get('hits'), '2')
  })

  test('increment keeps the expiry set on creation', async () => {
    let now = 0
    const store = inMemorySessionStore(() => now)
    await store.increment('hits', 10)
    now = 9_000
    assert.equal(await store.increment('hits', 10), 2)
    now = 10_000
    assert.equal(await store.get('hits'), null)
    assert.equal(await store.increment('hits', 10), 1)
  })

  test('expired entries are gone from get, getAndDelete and size', async () => {
    let now = 0
    const store = inMemorySessionStore(() => now)
    await store.set('a', '1', 1)
    await store.set('b', '2')
    now = 1_000
    assert.equal(await store.get('a'), null)
    assert.equal(await store.getAndDelete('a'), null)
    assert.equal(store.size(), 1)
    store.clear()
    assert.equal(store.size(), 0)
  })
})

describe('prefixedSessionStore', () => {
  test('every operation lands under the prefix', async () => {
    const backing = inMemorySessionStore()
    const store = prefixedSessionStore(backing, 'app_1/')
    await store.set('k', 'v', 60)
    assert.equal(await backing.get('app_1/k'), 'v')
    assert.equal(await store.get('k'), 'v')
    assert.equal(await store.increment('n', 60), 1)
    assert.equal(await backing.get('app_1/n'), '1')
    assert.equal(await store.getAndDelete('k'), 'v')
    assert.equal(await backing.get('app_1/k'), null)
    await store.set('d', 'x')
    await store.delete('d')
    assert.equal(await backing.get('app_1/d'), null)
  })
})
