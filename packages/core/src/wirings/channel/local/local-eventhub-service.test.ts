import * as assert from 'assert'
import { test } from 'node:test'
import type { PikkuChannelHandler } from '../channel.types.js'
import { LocalEventHubService } from './local-eventhub-service.js'

class MockChannelHandler implements PikkuChannelHandler {
  private channelId: string

  constructor(channelId: string) {
    this.channelId = channelId
  }

  getChannel() {
    return { channelId: this.channelId } as any
  }

  send(data: unknown, isBinary?: boolean) {
    console.log(`Sent to ${this.channelId}:`, { data, isBinary })
  }
}

test('LocalEventHubService: subscribe and unsubscribe', () => {
  const eventHub = new LocalEventHubService()

  eventHub.subscribe('topic1', 'channel1')
  assert.strictEqual(eventHub['subscriptions'].get('topic1')!.size, 1)

  eventHub.unsubscribe('topic1', 'channel1')
  assert.strictEqual(eventHub['subscriptions'].has('topic1'), false)
})

test('LocalEventHubService: publish messages', () => {
  const eventHub = new LocalEventHubService()

  const channel1 = new MockChannelHandler('channel1')
  const channel2 = new MockChannelHandler('channel2')
  eventHub.onChannelOpened(channel1)
  eventHub.onChannelOpened(channel2)

  eventHub.subscribe('topic1', 'channel1')
  eventHub.subscribe('topic1', 'channel2')

  let sendCallCount = 0
  channel1.send = () => {
    sendCallCount++
  }
  channel2.send = () => {
    sendCallCount++
  }

  eventHub.publish('topic1', 'channel1', { message: 'Hello!' })

  assert.strictEqual(sendCallCount, 1)
})

test('LocalEventHubService: onChannelOpened and onChannelClosed', () => {
  const eventHub = new LocalEventHubService()

  const channel1 = new MockChannelHandler('channel1')
  eventHub.onChannelOpened(channel1)
  assert.strictEqual(eventHub['channels'].has('channel1'), true)

  eventHub.onChannelClosed('channel1')
  assert.strictEqual(eventHub['channels'].has('channel1'), false)
})

test('LocalEventHubService: clean up empty topics on channel close', () => {
  const eventHub = new LocalEventHubService()

  const channel1 = new MockChannelHandler('channel1')
  eventHub.onChannelOpened(channel1)
  eventHub.subscribe('topic1', 'channel1')

  eventHub.onChannelClosed('channel1')

  assert.strictEqual(eventHub['subscriptions'].has('topic1'), false)
})
