import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { EventHubService } from '@pikku/core/channel'
import { defineEventHubServiceTests } from '@pikku/core/testing'
import { PgEventHubService } from './pg-eventhub-service.js'

defineEventHubServiceTests(
  'PgEventHubService',
  () => new PgEventHubService('postgres://unused')
)

describe('PgEventHubService with an injected transport hub', () => {
  const injected = () => {
    const calls: string[] = []
    const transport = {
      subscribe: async () => {},
      unsubscribe: async () => {},
      publish: async () => {},
      onChannelOpened: async () => {
        calls.push('opened')
      },
      onChannelClosed: async (channelId: string) => {
        calls.push(`closed:${channelId}`)
      },
    }
    return {
      calls,
      hub: new PgEventHubService(
        'postgres://unused',
        transport as unknown as EventHubService
      ),
    }
  }

  test('the channel lifecycle reaches the hub the sockets are registered on', async () => {
    const { calls, hub } = injected()

    await hub.onChannelOpened({ getChannel: () => ({ channelId: 'c1' }) } as never)
    await hub.onChannelClosed('c1')

    assert.deepEqual(
      calls,
      ['opened', 'closed:c1'],
      'sending it to the private fallback hub would leave the transport unaware of the channel'
    )
  })
})
