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
    unsubscribe: () => {},
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
})

defineEventHubServiceTests('UWSEventHubService', () => new UWSEventHubService())
