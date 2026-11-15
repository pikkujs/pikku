import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { installEventHubDistributor } from './host.js'
import { getEventHubDistributor, setEventHubDistributor } from './runtime.js'

describe('installEventHubDistributor', () => {
  test('holds the distributor in package state and out of services', () => {
    const { distributor, services } = installEventHubDistributor({
      topics: () => ['news'],
    })
    assert.equal(getEventHubDistributor(), distributor)
    assert.equal(Object.values(services).includes(distributor as never), false)
    setEventHubDistributor(undefined)
  })

  test('services.eventHub has no subscribe at runtime', () => {
    const { services } = installEventHubDistributor()
    assert.equal('subscribe' in services.eventHub, false)
    assert.equal('unsubscribe' in services.eventHub, false)
    assert.equal('attach' in services.eventHub, false)
    assert.equal('addSubscription' in services.eventHub, false)
    assert.deepEqual(Object.keys(services.eventHubRegistry), ['add'])
    setEventHubDistributor(undefined)
  })

  test('registers the in-process delivery backend', () => {
    const { distributor } = installEventHubDistributor()
    assert.equal(distributor.deliveryFor('local')?.name, 'local')
    setEventHubDistributor(undefined)
  })

  test('registry.add refuses a map that names no topics', () => {
    const { services } = installEventHubDistributor()
    assert.throws(
      () =>
        services.eventHubRegistry.add(
          { name: 'r', forward: () => {} },
          { topics: [] }
        ),
      /needs a map/
    )
    setEventHubDistributor(undefined)
  })

  const attachAndSubscribe = (
    distributor: ReturnType<typeof installEventHubDistributor>['distributor']
  ) => {
    const handler = {
      getChannel: () => ({ channelId: 'a', close() {} }) as any,
      send() {},
      sendBinary() {},
    } as any
    distributor.attach(handler, distributor.deliveryFor('local')!, undefined)
    distributor.addSubscription('a', 'news', {
      pikkuFuncId: 'news',
      wireType: 'http',
      wireId: 'GET:/news',
      input: {},
      session: undefined,
    })
  }

  test('starts the sweeper: an open subscription whose re-run fails is dropped', async () => {
    const { distributor, sweeper } = installEventHubDistributor({
      topics: () => ['news'],
      subscriptionRecheckMs: 10,
    })
    attachAndSubscribe(distributor)
    await new Promise((resolve) => setTimeout(resolve, 80))
    sweeper.stop()
    assert.equal(distributor.subscriptionCount(), 0)
    setEventHubDistributor(undefined)
  })

  test('a recheck interval of 0 leaves the sweeper off', async () => {
    const { distributor, sweeper } = installEventHubDistributor({
      topics: () => ['news'],
      subscriptionRecheckMs: 0,
    })
    attachAndSubscribe(distributor)
    await new Promise((resolve) => setTimeout(resolve, 40))
    sweeper.stop()
    assert.equal(distributor.subscriptionCount(), 1)
    setEventHubDistributor(undefined)
  })
})
