import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { EventHubService } from '../../wirings/channel/eventhub-service.js'
import type {
  BinaryData,
  PikkuChannel,
  PikkuChannelHandler,
} from '../../wirings/channel/channel.types.js'
import { unsupportedChannelRemote } from '../../wirings/channel/channel-rpc.js'

/** A channel that is not a socket — what an SSE stream looks like to a hub. */
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
    // A hub only ever pushes; nothing here answers back.
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
 * Conformance suite for `EventHubService`.
 *
 * It asks one question the old per-runtime tests could not: can a channel that
 * is NOT this runtime's native socket receive a publish? That is the SSE case,
 * and every hub that claims to accept a handler has to answer yes. Hubs that
 * cannot — Lambda, Cloudflare — are expected to throw from `onChannelOpened`
 * instead, which `expectsHandlerSupport: false` asserts.
 *
 * The previous Bun test passed while the feature was broken because it called
 * `onChannelOpened('c1', socket)` — it encoded the wrong signature rather than
 * checking the behaviour. A suite shared across runtimes is what stops that
 * happening again.
 */
export const defineEventHubServiceTests = (
  name: string,
  makeHub: () =>
    | EventHubService<Record<string, any>>
    | Promise<EventHubService<Record<string, any>>>,
  { expectsHandlerSupport = true }: { expectsHandlerSupport?: boolean } = {}
): void => {
  describe(`EventHubService [${name}]`, () => {
    if (!expectsHandlerSupport) {
      test('refuses a handler-backed channel rather than dropping it', async () => {
        const hub = await makeHub()
        const { handler } = recordingHandler('sse-1')
        await assert.rejects(async () => hub.onChannelOpened(handler))
      })
      return
    }

    test('delivers a publish to a handler-backed (SSE) channel', async () => {
      const hub = await makeHub()
      const { handler, received } = recordingHandler('sse-1')

      await hub.onChannelOpened(handler)
      await hub.subscribe('news', 'sse-1')
      await hub.publish('news', null, { hello: 'world' })

      assert.deepEqual(received, [{ hello: 'world' }])
    })

    test('does not deliver a topic the channel never subscribed to', async () => {
      const hub = await makeHub()
      const { handler, received } = recordingHandler('sse-1')

      await hub.onChannelOpened(handler)
      await hub.subscribe('news', 'sse-1')
      await hub.publish('sport', null, { hello: 'world' })

      assert.deepEqual(received, [])
    })

    test('skips the channel named in publish', async () => {
      const hub = await makeHub()
      const a = recordingHandler('sse-a')
      const b = recordingHandler('sse-b')

      await hub.onChannelOpened(a.handler)
      await hub.onChannelOpened(b.handler)
      await hub.subscribe('news', 'sse-a')
      await hub.subscribe('news', 'sse-b')
      await hub.publish('news', 'sse-a', { hello: 'world' })

      assert.deepEqual(a.received, [])
      assert.deepEqual(b.received, [{ hello: 'world' }])
    })

    test('unsubscribe stops delivery', async () => {
      const hub = await makeHub()
      const { handler, received } = recordingHandler('sse-1')

      await hub.onChannelOpened(handler)
      await hub.subscribe('news', 'sse-1')
      await hub.unsubscribe('news', 'sse-1')
      await hub.publish('news', null, { hello: 'world' })

      assert.deepEqual(received, [])
    })

    test('onChannelClosed stops delivery', async () => {
      const hub = await makeHub()
      const { handler, received } = recordingHandler('sse-1')

      await hub.onChannelOpened(handler)
      await hub.subscribe('news', 'sse-1')
      await hub.onChannelClosed('sse-1')
      await hub.publish('news', null, { hello: 'world' })

      assert.deepEqual(received, [])
    })
  })
}
