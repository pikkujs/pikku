import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { CoreSecretlessSingletonServices } from '../types/core.types.js'
import type {
  AnalyticsEventInput,
  AnalyticsIdentity,
} from './analytics.types.js'
import {
  flattenAnalyticsEvent,
  getAnalyticsSink,
  recordAnalyticsEvents,
  setAnalyticsSink,
} from './analytics.js'

const services = {} as CoreSecretlessSingletonServices
const anonymous: AnalyticsIdentity = { userId: null }

describe('flattenAnalyticsEvent', () => {
  it('splits the discriminator off the props', () => {
    assert.deepEqual(
      flattenAnalyticsEvent({
        name: 'checkout_completed',
        amount: 12,
        currency: 'EUR',
      }),
      { name: 'checkout_completed', props: { amount: 12, currency: 'EUR' } }
    )
  })

  it('omits `at` entirely when the client sent none', () => {
    // Not `at: undefined` — a sink that stores props verbatim would then write
    // an explicit null timestamp and lose "the client never said".
    assert.equal('at' in flattenAnalyticsEvent({ name: 'signed_up' }), false)
  })

  it('keeps an event with no props as an empty object, not undefined', () => {
    assert.deepEqual(flattenAnalyticsEvent({ name: 'signed_up' }).props, {})
  })
})

describe('recordAnalyticsEvents', () => {
  beforeEach(() => setAnalyticsSink(undefined))
  afterEach(() => setAnalyticsSink(undefined))

  it('accepts the batch and drops it when nothing is collecting', async () => {
    const accepted = await recordAnalyticsEvents(
      services,
      [{ name: 'page_viewed', props: { path: '/' } }],
      anonymous
    )
    assert.equal(accepted, 1)
  })

  it('forwards the batch and the identity to a registered sink', async () => {
    const seen: Array<[AnalyticsEventInput[], AnalyticsIdentity]> = []
    setAnalyticsSink(async (_s, events, identity) => {
      seen.push([events, identity])
    })

    const accepted = await recordAnalyticsEvents(
      services,
      [{ name: 'signed_up', props: {} }],
      { userId: 'u1' }
    )

    assert.equal(accepted, 1)
    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0]![1], { userId: 'u1' })
  })

  it('does not call the sink for an empty batch', async () => {
    let calls = 0
    setAnalyticsSink(async () => {
      calls++
    })
    assert.equal(await recordAnalyticsEvents(services, [], anonymous), 0)
    assert.equal(calls, 0)
  })

  it('lets a later registration replace the sink', async () => {
    setAnalyticsSink(async () => {})
    const second = async () => {}
    setAnalyticsSink(second)
    assert.equal(getAnalyticsSink(), second)
  })
})
