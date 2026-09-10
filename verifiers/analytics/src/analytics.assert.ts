import assert from 'node:assert/strict'
import { beforeEach, before, describe, test } from 'node:test'

import '../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import {
  collectedAnalytics,
  createConfig,
  createSingletonServices,
} from './services.js'

/**
 * `scaffold.pikkuDir` is load-bearing: it puts the generated wire outside
 * `srcDirectories`, where a real project keeps it and where the inspector does
 * not look. A wire that is emitted but not registered 404s every test below.
 */
const post = (body: unknown) =>
  fetch(
    new Request('http://localhost/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

/** Every event across every batch the invocation flushed. */
const recorded = () => collectedAnalytics.flat()

before(async () => {
  const config = await createConfig()
  await createSingletonServices(config)
})

beforeEach(() => {
  collectedAnalytics.length = 0
})

describe('the generated analytics ingest', () => {
  test('is registered, so the route answers rather than 404s', async () => {
    const response = await post({
      events: [{ event: { name: 'page_viewed', path: '/pricing' } }],
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { accepted: 1 })
  })

  test('hands the service the event name, its props and the client timestamp', async () => {
    await post({
      events: [
        {
          at: 1_700_000_000_000,
          event: {
            name: 'checkout_completed',
            amount: 42,
            currency: 'EUR',
          },
        },
      ],
    })

    const events = recorded()
    assert.equal(events.length, 1)
    assert.equal(events[0]!.name, 'checkout_completed')
    assert.deepEqual(events[0]!.props, { amount: 42, currency: 'EUR' })
    assert.equal(events[0]!.at, 1_700_000_000_000)
  })

  test('marks a relayed event as client-sourced', async () => {
    await post({
      events: [{ event: { name: 'page_viewed', path: '/' } }],
    })

    assert.equal(recorded()[0]!.source, 'client')
  })

  test('flushes the whole beacon as a single batch', async () => {
    await post({
      events: [
        { event: { name: 'page_viewed', path: '/' } },
        { event: { name: 'page_viewed', path: '/pricing' } },
      ],
    })

    assert.equal(collectedAnalytics.length, 1)
    assert.equal(collectedAnalytics[0]!.length, 2)
  })

  test('records an unauthenticated caller as nobody', async () => {
    await post({
      events: [{ event: { name: 'page_viewed', path: '/' } }],
    })

    assert.equal(recorded()[0]!.userIdentity.userId, null)
  })

  test('rejects an event the union does not declare', async () => {
    const response = await post({
      events: [{ event: { name: 'not_declared' } }],
    })

    assert.equal(response.status, 422)
    assert.equal(recorded().length, 0)
  })

  test('rejects a declared event missing a required prop', async () => {
    const response = await post({
      events: [{ event: { name: 'checkout_completed', amount: 42 } }],
    })

    assert.equal(response.status, 422)
    assert.equal(recorded().length, 0)
  })

  test('rejects a batch over the cap', async () => {
    const response = await post({
      events: Array.from({ length: 51 }, () => ({
        event: { name: 'page_viewed', path: '/' },
      })),
    })

    assert.equal(response.status, 422)
    assert.equal(recorded().length, 0)
  })

  test('rejects an empty batch', async () => {
    const response = await post({ events: [] })

    assert.equal(response.status, 422)
    assert.equal(recorded().length, 0)
  })
})
