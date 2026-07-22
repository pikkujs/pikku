import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BunEventHubService } from './bun-event-hub-service.js'

type FakeSocket = {
  subscribe: (topic: string) => void
  unsubscribe: (topic: string) => void
  subscribed: string[]
  unsubscribed: string[]
}

const makeSocket = (): FakeSocket => {
  const socket: FakeSocket = {
    subscribed: [],
    unsubscribed: [],
    subscribe: (topic) => socket.subscribed.push(topic),
    unsubscribe: (topic) => socket.unsubscribed.push(topic),
  }
  return socket
}

describe('BunEventHubService', () => {
  test('subscribe/unsubscribe proxy to the registered socket', async () => {
    const hub = new BunEventHubService()
    const socket = makeSocket()
    await hub.onChannelOpened('c1', socket as any)

    await hub.subscribe('news', 'c1')
    await hub.unsubscribe('news', 'c1')

    assert.deepEqual(socket.subscribed, ['news'])
    assert.deepEqual(socket.unsubscribed, ['news'])
  })

  test('subscribe is a no-op for unknown channels', async () => {
    const hub = new BunEventHubService()
    await assert.doesNotReject(hub.subscribe('news', 'missing'))
    await assert.doesNotReject(hub.unsubscribe('news', 'missing'))
  })

  test('publish does nothing before a server is set', async () => {
    const hub = new BunEventHubService()
    await assert.doesNotReject(hub.publish('news', null, { a: 1 }))
  })

  test('publish serializes JSON messages and forwards binary as-is', async () => {
    const hub = new BunEventHubService()
    const calls: Array<[string, unknown, boolean]> = []
    hub.setServer({
      publish: (topic: string, data: unknown, binary: boolean) =>
        calls.push([topic, data, binary]),
    } as any)

    await hub.publish('news', null, { hello: 'world' })
    const bin = new Uint8Array([1, 2, 3])
    await hub.publish('bin', null, bin as any, true)

    assert.deepEqual(calls[0], [
      'news',
      JSON.stringify({ hello: 'world' }),
      false,
    ])
    assert.equal(calls[1][0], 'bin')
    assert.equal(calls[1][1], bin)
    assert.equal(calls[1][2], true)
  })

  test('onChannelClosed removes the socket so later subscribes are no-ops', async () => {
    const hub = new BunEventHubService()
    const socket = makeSocket()
    await hub.onChannelOpened('c1', socket as any)
    await hub.onChannelClosed('c1')

    await hub.subscribe('news', 'c1')
    assert.deepEqual(socket.subscribed, [])
  })
})
