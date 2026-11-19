import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import type { PikkuChannelHandler } from '../channel.types.js'
import { createEventHubDistributor } from './event-hub-distributor.js'
import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import { subscribeChannelToTopic } from './runtime.js'

const subscription = (pikkuFuncId: string) => ({
  pikkuFuncId,
  packageName: null,
  wireType: 'channel',
  wireId: 'w',
  input: {},
  session: { userId: 'u1' },
})

describe('subscribeChannelToTopic', () => {
  let distributor: ReturnType<typeof createEventHubDistributor>
  const channel = {
    getChannel: () => ({ channelId: 'c1' }) as any,
    send: () => {},
    sendBinary: () => {},
  } as unknown as PikkuChannelHandler

  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'function', 'meta', {
      orderEvents: {
        pikkuFuncId: 'orderEvents',
        inputSchemaName: null,
        outputSchemaName: null,
        subscribe: { topicPattern: 'order:${string}' },
      },
      runsEvents: {
        pikkuFuncId: 'runsEvents',
        inputSchemaName: null,
        outputSchemaName: null,
        scopes: ['pikku:otlp:runs'],
        subscribe: { topicPattern: 'otlp.runs' },
      },
      notASubscriber: {
        pikkuFuncId: 'notASubscriber',
        inputSchemaName: null,
        outputSchemaName: null,
      },
    } as any)
    distributor = createEventHubDistributor()
    const backend = createLocalDeliveryBackend()
    distributor.registerDelivery(backend)
    distributor.attach(channel, backend, undefined)
  })

  test('subscribes a topic inside the pattern the function declared', () => {
    subscribeChannelToTopic(
      distributor,
      channel,
      'order:7',
      subscription('orderEvents')
    )
    assert.equal(distributor.subscriptionCount(), 1)
  })

  test('refuses a declared topic that belongs to another subscribe function', () => {
    assert.throws(
      () =>
        subscribeChannelToTopic(
          distributor,
          channel,
          'otlp.runs',
          subscription('orderEvents')
        ),
      /outside the pattern it declared/
    )
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('refuses a function that declared no subscribe pattern', () => {
    assert.throws(
      () =>
        subscribeChannelToTopic(
          distributor,
          channel,
          'order:7',
          subscription('notASubscriber')
        ),
      /outside the pattern it declared/
    )
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('the function that owns the topic subscribes to it with the scope', () => {
    subscribeChannelToTopic(distributor, channel, 'otlp.runs', {
      ...subscription('runsEvents'),
      session: { userId: 'u', scopes: ['pikku:otlp:runs'] },
    })
    assert.equal(distributor.subscriptionCount(), 1)
  })

  test('the runs topic is refused without pikku:otlp:runs, whichever function returned it', () => {
    assert.throws(
      () =>
        subscribeChannelToTopic(
          distributor,
          channel,
          'otlp.runs',
          subscription('runsEvents')
        ),
      /pikku:otlp:runs/
    )
    assert.equal(distributor.subscriptionCount(), 0)
  })
})
