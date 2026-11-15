import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PikkuChannelHandler } from '../channel.types.js'
import { createEventHubDistributor } from './event-hub-distributor.js'
import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import type {
  EventHubDeliveryBackend,
  EventHubMessage,
  EventHubRelayBackend,
  EventHubInbound,
  StoredSubscription,
} from './event-hub.types.js'

type Sent = { data: unknown; isBinary?: boolean }

const makeChannel = (channelId: string, failing = false) => {
  const sent: Sent[] = []
  const handler = {
    getChannel: () => ({ channelId }) as any,
    send: (data: unknown, isBinary?: boolean) => {
      if (failing) throw new Error('socket closed')
      sent.push({ data, isBinary })
    },
    sendBinary: () => {},
  } as unknown as PikkuChannelHandler
  return { handler, sent }
}

const subscription = (over: Partial<StoredSubscription> = {}) => ({
  pikkuFuncId: 'orderEvents',
  wireType: 'http',
  wireId: 'GET:/orders/events',
  input: {},
  session: { userId: 'u1' },
  expiresAt: undefined,
  ...over,
})

const setup = (topics: string[] = ['order:${string}', 'board:${string}']) => {
  const distributor = createEventHubDistributor({ topics: () => topics })
  const backend = createLocalDeliveryBackend()
  distributor.registerDelivery(backend)
  return { distributor, backend }
}

describe('attach, detach and delivery', () => {
  test('a published event reaches every subscriber of the topic', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    const b = makeChannel('b')
    const c = makeChannel('c')
    distributor.attach(a.handler, backend, undefined)
    distributor.attach(b.handler, backend, undefined)
    distributor.attach(c.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    distributor.addSubscription('b', 'order:1', subscription())
    distributor.addSubscription('c', 'order:2', subscription())

    await distributor.publish('order:1', { paid: true })

    assert.deepEqual(a.sent, [{ data: '{"paid":true}', isBinary: false }])
    assert.deepEqual(b.sent, [{ data: '{"paid":true}', isBinary: false }])
    assert.deepEqual(c.sent, [])
  })

  test('detach drops every subscription of the channel', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    distributor.addSubscription('a', 'board:9', subscription())
    assert.equal(distributor.subscriptionCount(), 2)

    distributor.detach('a')

    assert.equal(distributor.subscriptionCount(), 0)
    assert.equal(distributor.isAttached('a'), false)
    await distributor.publish('order:1', 1)
    await distributor.publish('board:9', 1)
    assert.deepEqual(a.sent, [])
  })

  test('a second delivery backend for one channel is refused', () => {
    const { distributor, backend } = setup()
    const other: EventHubDeliveryBackend = {
      name: 'other',
      transport: 'other-transport',
      deliver: () => [],
    }
    distributor.registerDelivery(other)
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)

    assert.throws(
      () => distributor.attach(a.handler, other, undefined),
      /channel a is already delivered by "local"/
    )
  })

  test('attaching through a backend that was never registered is refused', () => {
    const { distributor } = setup()
    const stranger: EventHubDeliveryBackend = {
      name: 'stranger',
      transport: 'stranger',
      deliver: () => [],
    }
    assert.throws(
      () => distributor.attach(makeChannel('a').handler, stranger, undefined),
      /not registered/
    )
  })

  test('two delivery backends cannot own the same transport', () => {
    const { distributor } = setup()
    assert.throws(
      () => distributor.registerDelivery(createLocalDeliveryBackend()),
      /already registered/
    )
    const double: EventHubDeliveryBackend = {
      name: 'second-local',
      transport: 'local',
      deliver: () => [],
    }
    assert.throws(
      () => distributor.registerDelivery(double),
      /transport "local" is already delivered by "local"/
    )
  })

  test('except skips the publishing channel', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    const b = makeChannel('b')
    distributor.attach(a.handler, backend, undefined)
    distributor.attach(b.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    distributor.addSubscription('b', 'order:1', subscription())

    await distributor.publish('order:1', 'x', { except: 'a' })

    assert.equal(a.sent.length, 0)
    assert.equal(b.sent.length, 1)
  })

  test('isBinary is carried to the channel', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    await distributor.publish('order:1', new Uint8Array([1]), {
      isBinary: true,
    })
    assert.equal(a.sent[0]!.isBinary, true)
  })

  test('a channel whose send throws is detached, and the others still get the event', async () => {
    const { distributor, backend } = setup()
    const dead = makeChannel('dead', true)
    const live = makeChannel('live')
    distributor.attach(dead.handler, backend, undefined)
    distributor.attach(live.handler, backend, undefined)
    distributor.addSubscription('dead', 'order:1', subscription())
    distributor.addSubscription('live', 'order:1', subscription())

    await distributor.publish('order:1', 'x')

    assert.equal(distributor.isAttached('dead'), false)
    assert.equal(live.sent.length, 1)
  })

  test('removeSubscription removes one topic of one channel only', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    const b = makeChannel('b')
    distributor.attach(a.handler, backend, undefined)
    distributor.attach(b.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    distributor.addSubscription('b', 'order:1', subscription())

    distributor.removeSubscription('a', 'order:1')
    await distributor.publish('order:1', 'x')

    assert.equal(a.sent.length, 0)
    assert.equal(b.sent.length, 1)
  })

  test('a bigint payload is serialised once and does not throw', async () => {
    const seen: string[] = []
    const distributor = createEventHubDistributor({
      topics: () => ['order:${string}'],
    })
    const backend: EventHubDeliveryBackend = {
      name: 'text',
      transport: 'text',
      deliver: (message: EventHubMessage) => {
        seen.push(message.serialized(), message.serialized())
        return []
      },
    }
    distributor.registerDelivery(backend)
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())

    await distributor.publish('order:1', { total: 10n })

    assert.deepEqual(seen, ['{"total":"10"}', '{"total":"10"}'])
  })
})

describe('what a subscription needs', () => {
  test('addSubscription needs an attached channel', () => {
    const { distributor } = setup()
    assert.throws(
      () => distributor.addSubscription('ghost', 'order:1', subscription()),
      /channel ghost is not attached/
    )
  })

  test('addSubscription refuses a topic no subscribe function could return', () => {
    const { distributor, backend } = setup()
    distributor.attach(makeChannel('a').handler, backend, undefined)
    assert.throws(
      () => distributor.addSubscription('a', 'secret:1', subscription()),
      /not a declared event hub topic/
    )
  })

  test('with no declared topics nothing is subscribable or publishable', async () => {
    const distributor = createEventHubDistributor({ topics: () => [] })
    const backend = createLocalDeliveryBackend()
    distributor.registerDelivery(backend)
    distributor.attach(makeChannel('a').handler, backend, undefined)
    assert.throws(
      () => distributor.addSubscription('a', 'order:1', subscription()),
      /not a declared event hub topic/
    )
    await assert.rejects(
      distributor.publish('order:1', 1),
      /not a declared event hub topic/
    )
  })

  test('publish refuses a topic that was never declared', async () => {
    const { distributor } = setup()
    await assert.rejects(
      distributor.publish('typo:1', 1),
      /"typo:1" is not a declared event hub topic/
    )
  })

  test('the stored record is kept for the sweeper', () => {
    const { distributor, backend } = setup()
    distributor.attach(makeChannel('a').handler, backend, { userId: 'u1' })
    const record = subscription({ expiresAt: 123 })
    distributor.addSubscription('a', 'order:1', record)
    assert.deepEqual(distributor.subscriptions(), [
      {
        channelId: 'a',
        topic: 'order:1',
        session: { userId: 'u1' },
        ...record,
      },
    ])
  })
})

describe('the three faces', () => {
  test('the publisher has no subscribe or unsubscribe, even through the prototype chain', () => {
    const { distributor } = setup()
    const publisher = distributor.publisher()
    assert.equal('subscribe' in publisher, false)
    assert.equal('unsubscribe' in publisher, false)
    assert.equal('addSubscription' in publisher, false)
    assert.equal('attach' in publisher, false)
    assert.deepEqual(Object.keys(publisher), ['publish'])
  })

  test('nothing on the publisher or the registry reaches the distributor', () => {
    const { distributor } = setup()
    const reachable = (root: object) => {
      const seen = new Set<unknown>()
      const walk = (value: unknown): boolean => {
        if (value === distributor) return true
        if (
          value === null ||
          (typeof value !== 'object' && typeof value !== 'function')
        ) {
          return false
        }
        if (seen.has(value)) return false
        seen.add(value)
        for (const key of Reflect.ownKeys(value as object)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!
          if ('value' in descriptor && walk(descriptor.value)) return true
        }
        const proto = Object.getPrototypeOf(value)
        return proto &&
          proto !== Object.prototype &&
          proto !== Function.prototype
          ? walk(proto)
          : false
      }
      return walk(root)
    }
    assert.equal(reachable(distributor.publisher()), false)
    assert.equal(reachable(distributor.registry()), false)
  })

  test('the publisher publishes through the distributor', async () => {
    const { distributor, backend } = setup()
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())
    await distributor.publisher().publish('order:1', 'x')
    assert.equal(a.sent.length, 1)
  })
})

const makeRelay = (name: string) => {
  const forwarded: EventHubMessage[] = []
  let inbound: EventHubInbound | undefined
  const relay: EventHubRelayBackend = {
    name,
    forward: (message) => {
      forwarded.push(message)
    },
    start: (receive) => {
      inbound = receive
    },
  }
  return {
    relay,
    forwarded,
    receive: (m: Parameters<EventHubInbound>[0]) => inbound!(m),
  }
}

describe('relays', () => {
  test('a relay whose topics overlap another relay is refused', () => {
    const { distributor } = setup()
    const pg = makeRelay('pg')
    const mqtt = makeRelay('mqtt')
    distributor.registry().add(pg.relay, { topics: ['order:${string}'] })
    assert.throws(
      () => distributor.registry().add(mqtt.relay, { topics: ['order:7'] }),
      /relay "mqtt" overlaps relay "pg" on "order:7"/
    )
  })

  test('a relay with the same name is refused, and a map with no topics is refused', () => {
    const { distributor } = setup()
    const pg = makeRelay('pg')
    distributor.registry().add(pg.relay, { topics: ['order:${string}'] })
    assert.throws(
      () =>
        distributor
          .registry()
          .add(makeRelay('pg').relay, { topics: ['board:${string}'] }),
      /relay "pg" is already registered/
    )
    assert.throws(
      () => distributor.registry().add(makeRelay('x').relay, { topics: [] }),
      /needs a map naming the topics/
    )
    assert.throws(
      () =>
        distributor.registry().add(makeRelay('y').relay, undefined as never),
      /needs a map naming the topics/
    )
  })

  test('a local publish is forwarded only to relays whose map names the topic', async () => {
    const { distributor } = setup()
    const pg = makeRelay('pg')
    const mqtt = makeRelay('mqtt')
    distributor.registry().add(pg.relay, { topics: ['order:${string}'] })
    distributor.registry().add(mqtt.relay, { topics: ['board:${string}'] })

    await distributor.publish('order:1', { a: 1 })

    assert.equal(pg.forwarded.length, 1)
    assert.equal(mqtt.forwarded.length, 0)
  })

  test('an inbound event is delivered locally once and never relayed again', async () => {
    const { distributor, backend } = setup()
    const pg = makeRelay('pg')
    distributor.registry().add(pg.relay, { topics: ['order:${string}'] })
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())

    await pg.receive({ topic: 'order:1', data: { n: 1 }, isBinary: false })

    assert.equal(a.sent.length, 1)
    assert.equal(pg.forwarded.length, 0)
  })

  test('an inbound topic outside the relay map or the declared topics is dropped', async () => {
    const errors: unknown[] = []
    const distributor = createEventHubDistributor({
      topics: () => ['order:${string}', 'board:${string}'],
      onError: (error) => errors.push(error),
    })
    const backend = createLocalDeliveryBackend()
    distributor.registerDelivery(backend)
    const pg = makeRelay('pg')
    distributor.registry().add(pg.relay, { topics: ['order:${string}'] })
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'board:1', subscription())
    distributor.addSubscription('a', 'order:1', subscription())

    await pg.receive({ topic: 'board:1', data: 1, isBinary: false })
    await pg.receive({ topic: 'rogue:1', data: 1, isBinary: false })

    assert.equal(a.sent.length, 0)
    assert.equal(errors.length, 2)
  })

  test('a relay that throws never fails the publisher', async () => {
    const errors: unknown[] = []
    const distributor = createEventHubDistributor({
      topics: () => ['order:${string}'],
      onError: (error) => errors.push(error),
    })
    const backend = createLocalDeliveryBackend()
    distributor.registerDelivery(backend)
    const broken: EventHubRelayBackend = {
      name: 'broken',
      forward: () => {
        throw new Error('pg down')
      },
    }
    distributor.registry().add(broken, { topics: ['order:${string}'] })
    const a = makeChannel('a')
    distributor.attach(a.handler, backend, undefined)
    distributor.addSubscription('a', 'order:1', subscription())

    await distributor.publish('order:1', 1)

    assert.equal(a.sent.length, 1)
    assert.equal(errors.length, 1)
  })
})
