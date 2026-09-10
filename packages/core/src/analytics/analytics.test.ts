import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CoreUserSession, PikkuWire } from '../types/core.types.js'
import type { AnalyticsRecord, AnalyticsService } from './analytics.types.js'
import { createInvocationAnalytics, flattenAnalyticsEvent } from './analytics.js'

const makeWire = (session?: CoreUserSession) =>
  ({
    session,
    traceId: 'trace-1',
    functionId: 'completeCheckout',
    wireType: 'http',
    pikkuUserId: 'pikku-1',
  }) as unknown as PikkuWire<any, any, any, CoreUserSession>

const recordingService = () => {
  const batches: AnalyticsRecord[][] = []
  const service: AnalyticsService = {
    async record(event) {
      batches.push([event])
    },
    async write(batch) {
      batches.push(batch)
    },
  }
  return { service, batches }
}

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
    // Not `at: undefined` — a service that stores props verbatim would then
    // write an explicit null timestamp and lose "the client never said".
    assert.equal('at' in flattenAnalyticsEvent({ name: 'signed_up' }), false)
  })

  it('keeps an event with no props as an empty object, not undefined', () => {
    assert.deepEqual(flattenAnalyticsEvent({ name: 'signed_up' }).props, {})
  })
})

describe('createInvocationAnalytics', () => {
  it('buffers until flushed, then writes the batch once', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(service, makeWire())

    await analytics.record({ name: 'page_viewed', path: '/todos' })
    await analytics.record({ name: 'todo_created', priority: 'low' })
    assert.equal(batches.length, 0)

    await analytics.flush()
    assert.equal(batches.length, 1)
    assert.deepEqual(
      batches[0]!.map((event) => event.name),
      ['page_viewed', 'todo_created']
    )
  })

  it('stamps identity, trace and wire fields from the invocation', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(
      service,
      makeWire({ userId: 'user-1', orgId: 'org-1' } as CoreUserSession)
    )

    await analytics.record({ name: 'checkout_completed', amount: 12 })
    await analytics.close()

    const event = batches[0]![0]!
    assert.deepEqual(event.userIdentity, {
      userId: 'user-1',
      orgId: 'org-1',
      pikkuUserId: 'pikku-1',
    })
    assert.equal(event.traceId, 'trace-1')
    assert.equal(event.functionId, 'completeCheckout')
    assert.equal(event.wireType, 'http')
    assert.deepEqual(event.props, { amount: 12 })
  })

  it('records an unauthenticated caller as nobody', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(service, makeWire())

    await analytics.record({ name: 'page_viewed', path: '/' })
    await analytics.close()

    assert.equal(batches[0]![0]!.userIdentity.userId, null)
  })

  it('marks a relayed event as client-sourced and keeps its clock', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(service, makeWire())

    await analytics.record({ name: 'page_viewed', path: '/' }, { at: 1700 })
    await analytics.close()

    assert.equal(batches[0]![0]!.source, 'client')
    assert.equal(batches[0]![0]!.at, 1700)
  })

  it('marks an event a function recorded as server-sourced', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(service, makeWire())

    await analytics.record({ name: 'checkout_completed', amount: 1 })
    await analytics.close()

    assert.equal(batches[0]![0]!.source, 'server')
    assert.equal('at' in batches[0]![0]!, false)
  })

  it('falls back to record() when the service takes no batch', async () => {
    const seen: AnalyticsRecord[] = []
    const analytics = createInvocationAnalytics(
      {
        async record(event) {
          seen.push(event)
        },
      },
      makeWire()
    )

    await analytics.record({ name: 'a' })
    await analytics.record({ name: 'b' })
    await analytics.close()

    assert.deepEqual(
      seen.map((event) => event.name),
      ['a', 'b']
    )
  })

  it('warns rather than throws when the destination fails', async () => {
    const warnings: unknown[] = []
    const analytics = createInvocationAnalytics(
      {
        async record() {
          throw new Error('destination down')
        },
      },
      makeWire(),
      { warn: (message: any) => warnings.push(message) } as any
    )

    await analytics.record({ name: 'page_viewed' })
    await analytics.close()

    assert.equal(warnings.length, 1)
  })

  it('flushes nothing when nothing was recorded', async () => {
    const { service, batches } = recordingService()
    const analytics = createInvocationAnalytics(service, makeWire())

    await analytics.close()

    assert.equal(batches.length, 0)
  })
})
