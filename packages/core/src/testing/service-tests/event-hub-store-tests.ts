import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { EventHubStore } from '../../wirings/channel/eventhub-store.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `eventHubStore`. Runs only when a backend supplies one. */
export const defineEventHubStoreTests = (
  name: string,
  eventHubStore: NonNullable<ServiceTestConfig['services']['eventHubStore']>
): void => {
  const factory = eventHubStore
  describe(`EventHubStore [${name}]`, () => {
    let store: EventHubStore<Record<string, any>>

    before(async () => {
      store = await factory()
    })

    test('subscribe and getChannelIdsForTopic', async () => {
      const result = await store.subscribe('topic-1', 'ch-1')
      assert.equal(result, true)

      const ids = await store.getChannelIdsForTopic('topic-1')
      assert.deepEqual(ids, ['ch-1'])
    })

    test('subscribe duplicate is idempotent', async () => {
      const result = await store.subscribe('topic-1', 'ch-1')
      assert.equal(result, true)
    })

    test('unsubscribe returns true when exists', async () => {
      const result = await store.unsubscribe('topic-1', 'ch-1')
      assert.equal(result, true)
    })

    test('unsubscribe returns false when not exists', async () => {
      const result = await store.unsubscribe('topic-1', 'ch-1')
      assert.equal(result, false)
    })

    test('getChannelIdsForTopic returns empty for unknown topic', async () => {
      const ids = await store.getChannelIdsForTopic('unknown')
      assert.deepEqual(ids, [])
    })
  })
}
