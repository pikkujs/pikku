import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  createEventHubDistributor,
  createLocalDeliveryBackend,
} from '@pikku/core/internal/event-hub'
import {
  PG_NOTIFY_MAX_BYTES,
  PgEventHubRelay,
  type PgNotifyClient,
} from './pg-eventhub-relay.js'

/** A stand-in for one Postgres database: every client listening on a channel hears every notify, the notifier included, as Postgres does. */
const createBus = () => {
  const listeners: Array<(payload: string) => void> = []
  const notified: string[] = []
  const client = (): PgNotifyClient => ({
    listen: async (_channel, onNotify) => {
      listeners.push(onNotify)
    },
    notify: async (_channel, payload) => {
      notified.push(payload)
      for (const listener of listeners) listener(payload)
    },
    end: async () => {},
  })
  return { client, notified, listeners }
}

const instance = async (
  bus: ReturnType<typeof createBus>,
  instanceId: string,
  topics: readonly string[] = ['order:${string}'],
  declared: readonly string[] = ['order:${string}']
) => {
  const errors: unknown[] = []
  const distributor = createEventHubDistributor({
    topics: () => declared,
    onError: (error) => errors.push(error),
  })
  distributor.registerDelivery(createLocalDeliveryBackend())
  const relay = new PgEventHubRelay(bus.client(), { instanceId })
  const forwarded: string[] = []
  const forward = relay.forward.bind(relay)
  relay.forward = async (message) => {
    forwarded.push(message.topic)
    await forward(message)
  }
  distributor.registry().add(relay, { topics: [...topics] })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const received: Array<{ data: unknown; isBinary?: boolean }> = []
  const handler = {
    getChannel: () => ({ channelId: `ch-${instanceId}` }) as any,
    send: (data: unknown, isBinary?: boolean) => {
      received.push({ data, isBinary })
    },
    sendBinary: (data: unknown) => {
      received.push({ data, isBinary: true })
    },
  } as any
  distributor.attach(handler, distributor.deliveryFor('local')!, undefined)
  distributor.addSubscription(`ch-${instanceId}`, 'order:7', {
    pikkuFuncId: 'orderEvents',
    wireType: 'http',
    wireId: 'GET:/orders/events',
    input: {},
    session: undefined,
  })
  return { distributor, received, errors, forwarded }
}

describe('PgEventHubRelay', () => {
  test('an event published on one instance reaches the other once, and the first once', async () => {
    const bus = createBus()
    const a = await instance(bus, 'a')
    const b = await instance(bus, 'b')

    await a.distributor.publish('order:7', { paid: true })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(
      a.received.length,
      1,
      'its own notification is not delivered again'
    )
    assert.equal(b.received.length, 1)
    assert.equal(b.received[0]!.data, '{"paid":true}')
    assert.equal(b.errors.length, 0)
  })

  test('an inbound event is never relayed again', async () => {
    const bus = createBus()
    const a = await instance(bus, 'a')
    const b = await instance(bus, 'b')

    await a.distributor.publish('order:7', { n: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.deepEqual(a.forwarded, ['order:7'])
    assert.deepEqual(b.forwarded, [], 'b only delivered it')
    assert.equal(bus.notified.length, 1)
  })

  test('a payload over 8 kB is refused with the topic named, and the local delivery still happens', async () => {
    const bus = createBus()
    const a = await instance(bus, 'a')
    const b = await instance(bus, 'b')

    await a.distributor.publish('order:7', {
      blob: 'x'.repeat(PG_NOTIFY_MAX_BYTES),
    })

    assert.equal(a.received.length, 1)
    assert.equal(b.received.length, 0)
    assert.equal(bus.notified.length, 0, 'nothing was sent to Postgres')
    assert.equal(a.errors.length, 1)
    assert.match((a.errors[0] as Error).message, /"order:7".*limit is 7999/)
  })

  test('a binary payload keeps isBinary across instances', async () => {
    const bus = createBus()
    const a = await instance(bus, 'a')
    const b = await instance(bus, 'b')

    await a.distributor.publish('order:7', Buffer.from([1, 2, 3]), {
      isBinary: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(b.received.length, 1)
    assert.equal(b.received[0]!.isBinary, true)
    assert.deepEqual([...(b.received[0]!.data as Uint8Array)], [1, 2, 3])
  })

  test('an inbound topic the relay does not carry, or that is not declared, is dropped', async () => {
    const bus = createBus()
    const b = await instance(bus, 'b')
    const inject = (topic: string) =>
      bus.listeners.forEach((listener) =>
        listener(
          JSON.stringify({
            instanceId: 'rogue',
            topic,
            isBinary: false,
            data: '{}',
          })
        )
      )

    inject('invoice:1')
    inject('order:7')
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(
      b.received.length,
      1,
      'only the declared, carried topic arrived'
    )
    assert.equal(b.errors.length, 1)
    assert.match((b.errors[0] as Error).message, /invoice:1/)
  })

  test('garbage on the channel is ignored', async () => {
    const bus = createBus()
    const b = await instance(bus, 'b')
    bus.listeners.forEach((listener) => listener('not json'))
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(b.received.length, 0)
    assert.equal(b.errors.length, 0)
  })
})
