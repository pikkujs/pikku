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
 * The whole ingest, generated from `src/analytics.ts` and nothing else:
 * this project wires no route, declares no function and imports no generated
 * file except the bootstrap.
 *
 * `scaffold.pikkuDir` is load-bearing rather than decorative. It puts the
 * generated wire outside `srcDirectories`, which is where a real project keeps
 * it and where the inspector does not look — so a wire that is emitted and not
 * explicitly inspected is registered nowhere, and every test below 404s.
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
  /**
   * The regression this verifier exists for. Nothing in a project imports the
   * generated wire, and the scaffold dir is not a source directory, so a route
   * that is emitted but not inspected is registered nowhere — and looks
   * entirely healthy until something asks for it.
   */
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

  /**
   * The only thing separating a page view a browser sent from an outcome a
   * function recorded, once both are in the same series.
   */
  test('marks a relayed event as client-sourced', async () => {
    await post({
      events: [{ event: { name: 'page_viewed', path: '/' } }],
    })

    assert.equal(recorded()[0]!.source, 'client')
  })

  /**
   * One flush per invocation: a batch the browser sent as one request costs the
   * destination one write.
   */
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

  /**
   * The reason an unauthenticated ingest is safe to expose: there is no field a
   * caller can set to attribute events to someone else.
   */
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

  /**
   * The batch cap is what stops one unauthenticated request asking for
   * unbounded work.
   */
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
