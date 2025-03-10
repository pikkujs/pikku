import { test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { PikkuAbstractChannelHandler } from './pikku-abstract-channel-handler.js'

// A concrete implementation of the abstract class for testing
class TestChannelHandler extends PikkuAbstractChannelHandler<
  { param: string },
  { msg: string }
> {
  public async send(message: { msg: string }, isBinary = false): Promise<void> {
    // Mock send implementation
  }
}

let handler: TestChannelHandler

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
