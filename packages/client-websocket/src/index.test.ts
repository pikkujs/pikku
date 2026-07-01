import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CorePikkuRouteHandler, CorePikkuWebsocket } from './index.js'

const createMockWebSocket = () => {
  const sent: unknown[] = []
  const ws = {
    binaryType: '',
    onmessage: null as unknown,
    send: (data: unknown) => {
      sent.push(data)
    },
  }
  return { ws: ws as unknown as WebSocket, sent }
}

describe('@pikku/websocket', () => {
  test('exports the public websocket client API', () => {
    assert.equal(typeof CorePikkuWebsocket, 'function')
    assert.equal(typeof CorePikkuRouteHandler, 'function')
  })

  test('send serialises the payload as JSON', () => {
    const { ws, sent } = createMockWebSocket()
    const client = new CorePikkuWebsocket(ws)

    client.send({ hello: 'world' })

    assert.deepEqual(sent, [JSON.stringify({ hello: 'world' })])
  })

  test('sendBinary forwards an ArrayBuffer unchanged', () => {
    const { ws, sent } = createMockWebSocket()
    const client = new CorePikkuWebsocket(ws)
    const buffer = new ArrayBuffer(8)

    client.sendBinary(buffer)

    assert.equal(sent.length, 1)
    assert.equal(sent[0], buffer)
  })

  test('sendBinary forwards a Uint8Array view unchanged', () => {
    const { ws, sent } = createMockWebSocket()
    const client = new CorePikkuWebsocket(ws)
    const view = new Uint8Array([1, 2, 3])

    client.sendBinary(view)

    assert.equal(sent.length, 1)
    assert.equal(sent[0], view)
  })
})
