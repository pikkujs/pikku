import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { ChannelStore } from '../../wirings/channel/channel-store.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `channelStore`. Runs only when a backend supplies one. */
export const defineChannelStoreTests = (
  name: string,
  channelStore: NonNullable<ServiceTestConfig['services']['channelStore']>
): void => {
  const factory = channelStore
  describe(`ChannelStore [${name}]`, () => {
    let store: ChannelStore

    before(async () => {
      store = await factory()
    })

    test('addChannel and getChannel', async () => {
      await store.addChannel({
        channelId: 'ch-1',
        channelName: 'test-channel',
        openingData: { foo: 'bar' },
      })

      const result = await store.getChannel('ch-1')
      assert.equal(result.channelId, 'ch-1')
      assert.equal(result.channelName, 'test-channel')
      assert.deepEqual(result.openingData, { foo: 'bar' })
      assert.equal(result.pikkuUserId, undefined)
    })

    test('setPikkuUserId', async () => {
      await store.setPikkuUserId('ch-1', 'user-1')

      const result = await store.getChannel('ch-1')
      assert.equal(result.pikkuUserId, 'user-1')
    })

    test('setPikkuUserId to null', async () => {
      await store.setPikkuUserId('ch-1', null)

      const result = await store.getChannel('ch-1')
      assert.equal(result.pikkuUserId, undefined)
    })

    test('getChannel throws for missing channel', async () => {
      await assert.rejects(
        async () => {
          await store.getChannel('missing')
        },
        { message: 'Channel not found: missing' }
      )
    })

    test('removeChannels', async () => {
      await store.addChannel({
        channelId: 'ch-2',
        channelName: 'temp-channel',
      })
      await store.removeChannels(['ch-2'])
      await assert.rejects(async () => {
        await store.getChannel('ch-2')
      })
    })

    test('removeChannels with empty array is no-op', async () => {
      await store.removeChannels([])
    })

    test('session round-trip — set / get / clear', async () => {
      await store.addChannel({
        channelId: 'ch-state',
        channelName: 'test-channel',
      })

      const empty = await store.getState('ch-state')
      assert.equal(empty, undefined)

      const payload = { userId: 'u-7', meta: { foo: 1 } }
      await store.setState('ch-state', payload)
      const got = await store.getState('ch-state')
      assert.deepEqual(got, payload)

      const next = { userId: 'u-8' }
      await store.setState('ch-state', next)
      const got2 = await store.getState('ch-state')
      assert.deepEqual(got2, next)

      await store.clearState('ch-state')
      const after = await store.getState('ch-state')
      assert.equal(after, undefined)

      await store.removeChannels(['ch-state'])
    })
  })
}
