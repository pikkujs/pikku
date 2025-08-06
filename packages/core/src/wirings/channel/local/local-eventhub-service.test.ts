import * as assert from 'assert'
import { test } from 'node:test'
import { PikkuChannelHandler } from '../channel.types.js'
import { CoreUserSession } from '../../../types/core.types.js'
import { LocalEventHubService } from './local-eventhub-service.js'

class MockChannelHandler implements PikkuChannelHandler {
  private channelId: string

  constructor(channelId: string) {
    this.channelId = channelId
  }

  setUserSession(session: CoreUserSession): Promise<void> | void {
    throw new Error('Method not needed.')
  }

  getChannel() {
    return { channelId: this.channelId } as any
  }

  send(data: unknown, isBinary?: boolean) {
    // Mock send functionality
    console.log(`Sent to ${this.channelId}:`, { data, isBinary })
  }
}

test('LocalEventHubService: subscribe and unsubscribe', () => {
  const eventHub = new LocalEventHubService()

  // Subscribe a channel to a topic
  eventHub.subscribe('topic1', 'channel1')
  assert.strictEqual(eventHub['subscriptions'].get('topic1')!.size, 1)

  // Unsubscribe the channel
  eventHub.unsubscribe('topic1', 'channel1')
  assert.strictEqual(eventHub['subscriptions'].has('topic1'), false)
})

test('LocalEventHubService: publish messages', () => {
  const eventHub = new LocalEventHubService()

  // Register mock channels
  const channel1 = new MockChannelHandler('channel1')
  const channel2 = new MockChannelHandler('channel2')
  eventHub.onChannelOpened(channel1)
  eventHub.onChannelOpened(channel2)

  // Subscribe channels to a topic
  eventHub.subscribe('topic1', 'channel1')
  eventHub.subscribe('topic1', 'channel2')

  // Mock `send` method to track calls
  let sendCallCount = 0
  channel1.send = () => {
    sendCallCount++
  }
  channel2.send = () => {
    sendCallCount++
  }

  // Publish a message
  eventHub.publish('topic1', 'channel1', { message: 'Hello!' })

  // Ensure the message was sent only to channel2
  assert.strictEqual(sendCallCount, 1)
})

test('LocalEventHubService: onChannelOpened and onChannelClosed', () => {
  const eventHub = new LocalEventHubService()

  // Register and verify channel
  const channel1 = new MockChannelHandler('channel1')
  eventHub.onChannelOpened(channel1)
  assert.strictEqual(eventHub['channels'].has('channel1'), true)

  // Close and verify removal
  eventHub.onChannelClosed('channel1')
  assert.strictEqual(eventHub['channels'].has('channel1'), false)
})

test('LocalEventHubService: clean up empty topics on channel close', () => {
  const eventHub = new LocalEventHubService()

  // Register and subscribe channels
  const channel1 = new MockChannelHandler('channel1')
  eventHub.onChannelOpened(channel1)
  eventHub.subscribe('topic1', 'channel1')

  // Close channel
  eventHub.onChannelClosed('channel1')

  // Ensure topic1 is removed
  assert.strictEqual(eventHub['subscriptions'].has('topic1'), false)
})
