import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CloudflareWebsocketStore } from './cloudflare-channel-store.js'

const socket = () => {
  let attachment: unknown
  return {
    serializeAttachment: (value: unknown) => {
      attachment = JSON.parse(JSON.stringify(value))
    },
    deserializeAttachment: () => attachment,
  }
}

describe('CloudflareWebsocketStore', () => {
  test('the trace survives hibernation and later attachment writes', async () => {
    const websocket = socket()
    const store = new CloudflareWebsocketStore({
      getWebSockets: () => [websocket],
    } as any)
    const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`

    await store.addChannel({
      channelId: 'ch-1',
      channelName: 'test',
      channelObject: websocket as any,
      traceparent,
    })
    await store.setPikkuUserId('ch-1', 'user-1')
    await store.setState('ch-1', { n: 1 })

    const channel = await store.getChannel('ch-1')
    assert.equal(channel.traceparent, traceparent)
    assert.equal(channel.pikkuUserId, 'user-1')
  })
})
