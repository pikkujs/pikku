import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemorySessionStore } from './in-memory-session-store.js'

describe('InMemorySessionStore', () => {
  test('get returns undefined for unknown user', async () => {
    const store = new InMemorySessionStore()
    const result = await store.get('unknown')
    assert.equal(result, undefined)
  })

  test('set and get round-trip', async () => {
    const store = new InMemorySessionStore()
    const session = { userId: 'user-1', organizationId: 'org-1' } as any
    await store.set('user-1', session)

    const result = await store.get('user-1')
    assert.deepEqual(result, session)
  })

  test('set overwrites previous session', async () => {
    const store = new InMemorySessionStore()
    await store.set('user-1', { userId: 'user-1', role: 'admin' } as any)
    await store.set('user-1', { userId: 'user-1', role: 'member' } as any)

    const result = await store.get('user-1')
    assert.deepEqual(result, { userId: 'user-1', role: 'member' })
  })

  test('clear removes session', async () => {
    const store = new InMemorySessionStore()
    await store.set('user-1', { userId: 'user-1' } as any)
    assert.ok(await store.get('user-1'))

    await store.clear('user-1')
    const result = await store.get('user-1')
    assert.equal(result, undefined)
  })

  test('clear is no-op for unknown user', async () => {
    const store = new InMemorySessionStore()
    await store.clear('nonexistent')
  })

  test('users are isolated', async () => {
    const store = new InMemorySessionStore()
    await store.set('user-a', { userId: 'a' } as any)
    await store.set('user-b', { userId: 'b' } as any)

    assert.deepEqual(await store.get('user-a'), { userId: 'a' })
    assert.deepEqual(await store.get('user-b'), { userId: 'b' })

    await store.clear('user-a')
    assert.equal(await store.get('user-a'), undefined)
    assert.deepEqual(await store.get('user-b'), { userId: 'b' })
  })
})
