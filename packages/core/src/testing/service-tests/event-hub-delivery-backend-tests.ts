import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createEventHubDistributor } from '../../wirings/channel/event-hub/event-hub-distributor.js'
import type { EventHubDeliveryBackend } from '../../wirings/channel/event-hub/event-hub.types.js'
import type {
  BinaryData,
  PikkuChannel,
  PikkuChannelHandler,
} from '../../wirings/channel/channel.types.js'
import { unsupportedChannelRemote } from '../../wirings/channel/channel-rpc.js'

const recordingHandler = (channelId: string) => {
  const received: unknown[] = []
  let state: unknown

  const channel: PikkuChannel<unknown, unknown> = {
    channelId,
    openingData: undefined,
    send: (message) => {
      received.push(message)
    },
    sendBinary: (data) => {
      received.push(data)
    },
    close: () => {
      channel.state = 'closed'
    },
    state: 'open',
    setState: (next) => {
      state = next
    },
    // knowledge: decisions/internals/channel-state-accessors-are-unsound-generics-that-every-implementation-asserts.md
    getState: () => state as never,
    clearState: () => {
      state = undefined
    },
    remote: unsupportedChannelRemote,
  }

  const handler: PikkuChannelHandler = {
    getChannel: () => channel,
    send: (message: unknown) => channel.send(message),
    sendBinary: (data: BinaryData) => channel.sendBinary(data),
  }
  return { handler, received }
}

/**
 * What every delivery backend owes the distributor: bytes reach the channels
 * it is handed, only those, and a channel it cannot reach is reported back.
 * The distributor decides who is subscribed; the backend only moves bytes.
 */
export const defineEventHubDeliveryBackendTests = (
  name: string,
  makeBackend: () => EventHubDeliveryBackend | Promise<EventHubDeliveryBackend>
): void => {
  describe(`EventHubDeliveryBackend [${name}]`, () => {
    const setup = async () => {
      const backend = await makeBackend()
      const distributor = createEventHubDistributor({
        topics: () => ['news', 'sport'],
      })
      distributor.registerDelivery(backend)
      const open = (channelId: string, topic?: string) => {
        const channel = recordingHandler(channelId)
        distributor.attach(channel.handler, backend, undefined)
        if (topic) {
          distributor.addSubscription(channelId, topic, {
            pikkuFuncId: 'news',
            wireType: 'http',
            wireId: 'get:/news',
            input: undefined,
            session: undefined,
          })
        }
        return channel
      }
      return { distributor, open }
    }

    test('delivers a publish to a subscribed channel', async () => {
      const { distributor, open } = await setup()
      const { received } = open('sse-1', 'news')
      await distributor.publish('news', { hello: 'world' })
      assert.deepEqual(received, [JSON.stringify({ hello: 'world' })])
    })

    test('does not deliver a topic the channel never subscribed to', async () => {
      const { distributor, open } = await setup()
      const { received } = open('sse-1', 'news')
      await distributor.publish('sport', { hello: 'world' })
      assert.deepEqual(received, [])
    })

    test('skips the channel named in except', async () => {
      const { distributor, open } = await setup()
      const a = open('sse-a', 'news')
      const b = open('sse-b', 'news')
      await distributor.publish('news', 'hi', { except: 'sse-a' })
      assert.deepEqual(a.received, [])
      assert.deepEqual(b.received, ['hi'])
    })

    test('stops delivering after the subscription is removed', async () => {
      const { distributor, open } = await setup()
      const { received } = open('sse-1', 'news')
      distributor.removeSubscription('sse-1', 'news')
      await distributor.publish('news', 'hi')
      assert.deepEqual(received, [])
    })

    test('stops delivering after the channel is detached', async () => {
      const { distributor, open } = await setup()
      const { received } = open('sse-1', 'news')
      distributor.detach('sse-1')
      await distributor.publish('news', 'hi')
      assert.deepEqual(received, [])
    })
  })
}
