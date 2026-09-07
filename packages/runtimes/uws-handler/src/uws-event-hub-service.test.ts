import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineEventHubServiceTests } from '@pikku/core/testing'
import { UWSEventHubService } from './uws-event-hub-service.js'

type FakeSocket = {
  subscribe: (topic: string) => void
  unsubscribe: (topic: string) => void
  publish: (topic: string, data: unknown, binary: boolean) => void
  subscribed: string[]
  published: Array<[string, unknown, boolean]>
}

const makeSocket = (): FakeSocket => {
  const socket: FakeSocket = {
    subscribed: [],
    published: [],
    subscribe: (topic) => socket.subscribed.push(topic),
    unsubscribe: (topic) => {
      socket.subscribed = socket.subscribed.filter((t) => t !== topic)
    },
    publish: (topic, data, binary) =>
      socket.published.push([topic, data, binary]),
  }
  return socket
}

describe('UWSEventHubService', () => {
  test('a registered socket subscribes natively', async () => {
    const hub = new UWSEventHubService()
    const socket = makeSocket()
    hub.registerSocket('c1', socket as any)

    await hub.subscribe('news', 'c1')

    assert.deepEqual(socket.subscribed, ['news'])
  })

  test('publish reaches both a socket and a handler-backed channel', async () => {
    const hub = new UWSEventHubService()
    const socket = makeSocket()
    hub.registerSocket('c1', socket as any)
    await hub.subscribe('news', 'c1')

    const received: unknown[] = []
    await hub.onChannelOpened({
      getChannel: () => ({ channelId: 'sse-1' }) as never,
      send: (message: unknown) => {
        received.push(message)
      },
      sendBinary: () => {},
    })
    await hub.subscribe('news', 'sse-1')

    await hub.publish('news', null, { hello: 'world' })

    assert.deepEqual(socket.published, [
      ['news', JSON.stringify({ hello: 'world' }), false],
    ])
    assert.deepEqual(received, [{ hello: 'world' }])
  })

  test('a registered socket unsubscribes natively, not through the local hub', async () => {
    const hub = new UWSEventHubService()
    const socket = makeSocket()
    hub.registerSocket('c1', socket as any)
    await hub.subscribe('news', 'c1')

    await hub.unsubscribe('news', 'c1')
    await hub.publish('news', null, { hello: 'world' })

    assert.deepEqual(socket.subscribed, [], 'uWS owns the subscription')
  })

  test('a closed channel keeps no socket behind', async () => {
    const hub = new UWSEventHubService()
    const socket = makeSocket()
    hub.registerSocket('c1', socket as any)
    await hub.subscribe('news', 'c1')

    await hub.onChannelClosed('c1')
    await hub.subscribe('news', 'c1')

    assert.deepEqual(
      socket.subscribed,
      ['news'],
      'the second subscribe went to the local hub, because the socket is gone'
    )
  })
})

defineEventHubServiceTests('UWSEventHubService', () => new UWSEventHubService())
