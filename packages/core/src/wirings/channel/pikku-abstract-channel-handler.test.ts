import { test, beforeEach, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import { PikkuAbstractChannelHandler } from './pikku-abstract-channel-handler.js'
import { setSingletonServices } from '../../pikku-state.js'
import { CHANNEL_RPC_RESPONSE } from './channel-rpc.js'
import type { ChannelRPCError } from './channel-rpc.js'
import { handleChannelRPCResponse } from './channel-host-rpc.js'

// A concrete implementation of the abstract class for testing
class TestChannelHandler extends PikkuAbstractChannelHandler<
  { param: string },
  { msg: string }
> {
  public sent: unknown[] = []

  public async send(message: { msg: string }, isBinary = false): Promise<void> {
    this.sent.push(message)
  }

  public sendBinary(_data: ArrayBuffer | Uint8Array): void {}
}

let handler: TestChannelHandler

/**
 * Arguments are checked before the request goes out, so the write lands a tick
 * after the call rather than in the same one.
 */
const sent = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  handler = new TestChannelHandler('test-channel-id', 'channel-name', {
    param: 'testParam',
  })
})

test('getChannel should return a channel with initial state', () => {
  const channel = handler.getChannel()
  assert.equal(channel.channelId, 'test-channel-id', 'Channel ID should match')
  assert.equal(channel.state, 'initial', 'Initial state should be "initial"')
  assert.deepEqual(
    channel.openingData,
    { param: 'testParam' },
    'Opening data should be accessible'
  )
})

test('open should change channel state to open', () => {
  handler.open()
  const channel = handler.getChannel()
  assert.equal(
    channel.state,
    'open',
    'State should be "open" after calling open()'
  )
})

test('close should change channel state to closed', () => {
  handler.close()
  const channel = handler.getChannel()
  assert.equal(
    channel.state,
    'closed',
    'State should be "closed" after calling close()'
  )
})

/**
 * Every channel gets `remote` — reverse RPC is a property of having an open
 * connection, not of any one wiring having asked for it.
 */
describe('channel.remote', () => {
  beforeEach(() => {
    // The transport builds a result validator from the singletons. Nothing
    // here declares an RPC contract, so validation finds no schema and passes.
    setSingletonServices({ logger: console } as never)
  })

  test('writes a request to the peer and resolves when it answers', async () => {
    const channel = handler.getChannel()
    const call = channel.remote('localCheckout', { cwd: '/repo' })
    await sent()

    const request = handler.sent[0] as {
      action: string
      id: string
      funcName: string
      data: unknown
    }
    assert.equal(request.funcName, 'localCheckout')
    assert.deepEqual(request.data, { cwd: '/repo' })

    handleChannelRPCResponse(channel.channelId, {
      action: CHANNEL_RPC_RESPONSE,
      id: request.id,
      ok: true,
      result: { sha: 'deadbeef' },
    })

    assert.deepEqual(await call, { sha: 'deadbeef' })
    handler.close()
  })

  test('a closing channel fails what the peer still owed an answer to', async () => {
    const channel = handler.getChannel()
    const call = channel.remote('localCheckout')

    handler.close()

    await assert.rejects(call, (e: ChannelRPCError) => {
      assert.equal(e.reason, 'closed')
      return true
    })
  })

  test('a second connection does not inherit the first transport', async () => {
    const first = handler.getChannel()
    const call = first.remote('localCheckout')
    handler.close()
    await assert.rejects(call)

    const reconnected = new TestChannelHandler(
      'test-channel-id',
      'channel-name',
      { param: 'testParam' }
    )
    const second = reconnected.getChannel().remote('localCheckout')
    await sent()
    // Ids restart, which is only safe because the closed transport was
    // forgotten rather than reused.
    assert.equal((reconnected.sent[0] as { id: string }).id, '1')
    reconnected.close()
    await assert.rejects(second)
  })
})
