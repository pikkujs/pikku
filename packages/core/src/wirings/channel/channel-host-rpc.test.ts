import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

import { CHANNEL_RPC_RESPONSE } from './channel-rpc.js'
import {
  getChannelHostRPC,
  handleChannelRPCResponse,
  releaseChannelHostRPC,
} from './channel-host-rpc.js'
import type { PikkuChannel } from './channel.types.js'

/**
 * A channel stripped to what the host RPC registry touches: an id to key the
 * transport by, and a send it writes requests to.
 */
const fakeChannel = (channelId: string) => {
  const sent: unknown[] = []
  const channel = {
    channelId,
    send: async (data: unknown) => {
      sent.push(data)
    },
  } as unknown as PikkuChannel<unknown, any>
  return { channel, sent }
}

describe('channel host RPC', () => {
  test('one transport per connection, reused across commands', async () => {
    const { channel } = fakeChannel('reuse')
    try {
      assert.equal(getChannelHostRPC(channel), getChannelHostRPC(channel))
    } finally {
      await releaseChannelHostRPC('reuse')
    }
  })

  test('separate connections get separate transports', async () => {
    const a = fakeChannel('a')
    const b = fakeChannel('b')
    try {
      assert.notEqual(
        getChannelHostRPC(a.channel),
        getChannelHostRPC(b.channel)
      )

      // Requests must land on their own socket, not the other connection's.
      // Nothing answers this one, so it is rejected by the release below.
      getChannelHostRPC(a.channel)
        .invoke('localCheckout', {})
        .catch(() => {})
      assert.equal(a.sent.length, 1)
      assert.equal(b.sent.length, 0)
    } finally {
      await releaseChannelHostRPC('a')
      await releaseChannelHostRPC('b')
    }
  })

  test('a response is routed back to the call it belongs to', async () => {
    const { channel, sent } = fakeChannel('routed')
    try {
      const service = getChannelHostRPC(channel)
      const call = service.invoke('localCheckout', {})
      const { id } = sent[0] as { id: string }

      assert.equal(
        handleChannelRPCResponse('routed', {
          action: CHANNEL_RPC_RESPONSE,
          id,
          ok: true,
          result: { sha: 'deadbeef' },
        }),
        true
      )
      assert.deepEqual(await call, { sha: 'deadbeef' })
    } finally {
      await releaseChannelHostRPC('routed')
    }
  })

  test('a frame for an unknown connection or id is dropped, not thrown', async () => {
    const { channel, sent } = fakeChannel('dropped')
    try {
      const service = getChannelHostRPC(channel)
      const call = service.invoke('localCheckout', {})
      const { id } = sent[0] as { id: string }

      // No transport for that connection at all.
      assert.equal(
        handleChannelRPCResponse('never-connected', {
          action: CHANNEL_RPC_RESPONSE,
          id,
          ok: true,
          result: null,
        }),
        false
      )
      // Right connection, but an id that was never registered — a late frame
      // from a call that already timed out looks exactly like this.
      assert.equal(
        handleChannelRPCResponse('dropped', {
          action: CHANNEL_RPC_RESPONSE,
          id: 'not-an-id',
          ok: true,
          result: null,
        }),
        false
      )

      handleChannelRPCResponse('dropped', {
        action: CHANNEL_RPC_RESPONSE,
        id,
        ok: true,
        result: 'ok',
      })
      assert.equal(await call, 'ok')
    } finally {
      await releaseChannelHostRPC('dropped')
    }
  })

  test('releasing rejects everything still in flight', async () => {
    const { channel } = fakeChannel('released')
    const call = getChannelHostRPC(channel).invoke('localCheckout', {})

    await releaseChannelHostRPC('released')

    // Without this a caller waits out the full timeout on a socket that is
    // already gone.
    await assert.rejects(call)
  })

  test('releasing forgets the connection', async () => {
    const { channel } = fakeChannel('forgotten')
    const first = getChannelHostRPC(channel)
    await releaseChannelHostRPC('forgotten')

    try {
      // A stale entry would hand a reconnecting channel a stopped transport,
      // and the map would grow for the life of the process.
      assert.notEqual(getChannelHostRPC(channel), first)
    } finally {
      await releaseChannelHostRPC('forgotten')
    }
  })

  test('releasing an unknown connection is a no-op', async () => {
    await releaseChannelHostRPC('was-never-here')
  })
})
