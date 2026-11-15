import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { addFunction } from '../../../function/function-runner.js'
import { ForbiddenError } from '../../../errors/errors.js'
import type { PikkuChannelHandler } from '../channel.types.js'
import { createEventHubDistributor } from './event-hub-distributor.js'
import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import { createSubscriptionSweeper } from './subscription-sweeper.js'

const makeChannel = (channelId: string) => {
  const closed: string[] = []
  const handler = {
    getChannel: () =>
      ({
        channelId,
        state: 'open',
        close: () => {
          closed.push(channelId)
        },
      }) as any,
    send: () => {},
    sendBinary: () => {},
  } as unknown as PikkuChannelHandler
  return { handler, closed }
}

const logger = { info() {}, warn() {}, error() {}, debug() {} }

let clock = 0
let granted: string[] = []
let topicFor = (input: { orderId: string }) => `order:${input.orderId}`
let permissionAllows = true

const setup = (maxSubscriptionLifetime?: number) => {
  const distributor = createEventHubDistributor({
    topics: () => ['order:${string}'],
    now: () => clock,
    maxSubscriptionLifetime,
  })
  const backend = createLocalDeliveryBackend()
  distributor.registerDelivery(backend)
  return { distributor, backend }
}

describe('the subscription sweeper', () => {
  beforeEach(() => {
    clock = 1_000_000
    granted = ['orders:read']
    topicFor = (input) => `order:${input.orderId}`
    permissionAllows = true
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      scopeService: { resolveScopes: async () => granted },
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
    pikkuState(null, 'function', 'meta', {
      orderEvents: {
        pikkuFuncId: 'orderEvents',
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: false,
        scopes: ['orders:read'],
        subscribe: { topicPattern: 'order:${string}' },
      },
    } as any)
    addFunction('orderEvents', {
      func: async (_services: any, input: { orderId: string }) => {
        if (!permissionAllows) throw new ForbiddenError('not your order')
        return topicFor(input)
      },
      scopes: ['orders:read'],
    } as any)
  })

  const open = (
    distributor: ReturnType<typeof setup>['distributor'],
    backend: ReturnType<typeof setup>['backend'],
    channelId: string,
    session: Record<string, unknown>
  ) => {
    const channel = makeChannel(channelId)
    distributor.attach(channel.handler, backend, session)
    distributor.addSubscription(channelId, 'order:7', {
      pikkuFuncId: 'orderEvents',
      wireType: 'http',
      wireId: 'GET:/orders/events',
      input: { orderId: '7' },
      session,
      packageName: null,
    })
    return channel
  }

  const resolved = {
    userId: 'u1',
    scopes: ['orders:read'],
    scopesResolvedAt: 1,
  }

  test('a scope revoked after connecting drops the subscription at the next recheck', async () => {
    const { distributor, backend } = setup()
    const channel = open(distributor, backend, 'a', resolved)
    const sweeper = createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 1000,
    })

    await sweeper.sweep()
    assert.equal(distributor.subscriptionCount(), 1, 'still held: kept')
    assert.deepEqual(channel.closed, [])

    granted = []
    await sweeper.sweep()
    assert.equal(distributor.subscriptionCount(), 0)
    assert.deepEqual(
      channel.closed,
      ['a'],
      'the client is cut so it reconnects'
    )
    assert.equal(distributor.isAttached('a'), false)
  })

  test('a permission that now throws drops the subscription', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    const errors: unknown[] = []
    const sweeper = createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 1000,
      onError: (error) => errors.push(error),
    })
    permissionAllows = false
    await sweeper.sweep()
    assert.equal(distributor.subscriptionCount(), 0)
    assert.equal(errors.length, 1)
  })

  test('a function that now answers with another topic drops the subscription', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    topicFor = () => 'order:8'
    await createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 1000,
    }).sweep()
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('one channel losing access leaves another channel alone', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    const other = open(distributor, backend, 'b', {
      ...resolved,
      userId: 'u2',
    })
    const sweeper = createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 1000,
      rerun: async (sub) => {
        if (sub.channelId === 'a') throw new ForbiddenError('no')
        return sub.topic
      },
    })
    await sweeper.sweep()
    assert.deepEqual(
      distributor.subscriptions().map((s) => s.channelId),
      ['b']
    )
    assert.deepEqual(other.closed, [])
  })

  test('a mapKey session, which cannot be re-read, is dropped at the max lifetime', async () => {
    const { distributor, backend } = setup(60_000)
    const channel = open(distributor, backend, 'a', {
      userId: 'svc',
      scopes: ['orders:read'],
    })
    const [stored] = distributor.subscriptions()
    assert.equal(stored!.expiresAt, 1_000_000 + 60_000)
    let reruns = 0
    const sweeper = createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 1000,
      rerun: async (sub) => {
        reruns++
        return sub.topic
      },
    })

    clock += 59_000
    await sweeper.sweep()
    assert.equal(distributor.subscriptionCount(), 1)

    clock += 1_000
    await sweeper.sweep()
    assert.equal(distributor.subscriptionCount(), 0)
    assert.deepEqual(channel.closed, ['a'])
    assert.equal(reruns, 1, 'an expired subscription is not re-run')
  })

  test('a session with resolved scopes has no hard end; the default lifetime is one hour', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    open(distributor, backend, 'b', { userId: 'svc', scopes: [] })
    const byChannel = Object.fromEntries(
      distributor.subscriptions().map((s) => [s.channelId, s.expiresAt])
    )
    assert.equal(byChannel.a, undefined)
    assert.equal(byChannel.b, 1_000_000 + 3_600_000)
  })

  test('dropSession ends every subscription a user holds', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    open(distributor, backend, 'b', resolved)
    const other = open(distributor, backend, 'c', { ...resolved, userId: 'u2' })
    assert.equal(await distributor.dropSession('u1'), 2)
    assert.deepEqual(
      distributor.subscriptions().map((s) => s.channelId),
      ['c']
    )
    assert.deepEqual(other.closed, [])
  })

  test('start sweeps on the interval and stop ends it', async () => {
    const { distributor, backend } = setup()
    open(distributor, backend, 'a', resolved)
    const sweeper = createSubscriptionSweeper({
      distributor,
      recheckIntervalMs: 10,
      rerun: async () => {
        throw new ForbiddenError('no')
      },
    })
    sweeper.start()
    await new Promise((r) => setTimeout(r, 60))
    sweeper.stop()
    assert.equal(distributor.subscriptionCount(), 0)
  })
})
