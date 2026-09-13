/**
 * Analytics end to end, with only the last hop replaced.
 *
 * The destinations are two in-memory recorders, so everything in front of them
 * is the real thing: the request-scoped buffer, the flush at the end of the
 * invocation, the composed identity resolvers, and the fan-out's `accepts`
 * predicate. Only the vendor call is missing, and no vendor is what this suite
 * is about.
 *
 * Every scenario empties the destinations first and reads them back in a
 * *later* request than the one it is asserting about — the buffer flushes when
 * the invocation that filled it ends, so reading in the same one would see
 * nothing and prove nothing.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'
import type { z } from 'zod'
import { analyticsEvents } from '../../src/analytics-events.js'

/**
 * The union the app declares, rebuilt from the declaration itself. The beacon
 * step takes a loose body — one scenario has to post an event the union does
 * not contain — so this is what pins the other scenarios to real events.
 */
type DeclaredEvent = {
  [Name in keyof typeof analyticsEvents]: { name: Name } & z.infer<
    (typeof analyticsEvents)[Name]
  >
}[keyof typeof analyticsEvents]

export const analyticsServerEventCarriesItsInvocationScenario = pikkuScenario<
  void,
  { recorded: number }
>({
  title: 'An event recorded by a function reaches its destination',
  description: 'Stamped with who was calling and which invocation it came from',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )

    await scenario.do(
      'the guest opens the quarterly report',
      'viewQuarterlyReport',
      null,
      { actor: actors.guest }
    )

    const recorded = await scenario.do(
      'reads the destinations back in a later request',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'the destination saw the event the function recorded',
      'expectsRecordedEvent',
      {
        recorded,
        name: 'report_viewed',
        expected: {
          source: 'server',
          props: { report: 'quarterly' },
          userId: guest.userId,
          hasTraceId: true,
        },
      }
    )
    return { recorded: recorded.all.length }
  },
})

/**
 * `accepts` is the app's policy, not the sink's: which events a destination
 * should receive is a decision about that destination, and it belongs beside
 * the fan-out rather than inside any one sink's mapper.
 */
export const analyticsAcceptsKeepsAnEventOutScenario = pikkuScenario<
  void,
  { conversions: number }
>({
  title: 'A destination only receives the events it accepts',
  description: 'The difference between the two destinations is the policy',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    await scenario.when(
      'a visitor reports a page view',
      'sendsAnalyticsBeacon',
      {
        events: [
          {
            event: {
              name: 'page_viewed',
              path: '/pricing',
            } satisfies DeclaredEvent,
          },
        ],
      }
    )
    await scenario.do(
      'the guest opens the quarterly report',
      'viewQuarterlyReport',
      null,
      { actor: actors.guest }
    )

    const recorded = await scenario.do(
      'reads the destinations back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'everything reached the first, only the conversion the second',
      'expectsRecordedEvents',
      {
        recorded,
        all: ['page_viewed', 'report_viewed'],
        conversions: ['report_viewed'],
      }
    )
    return { conversions: recorded.conversions.length }
  },
})

/**
 * A beacon is recorded as relayed from a browser rather than measured on the
 * server. Nothing about the caller is read from the body — identity is stamped
 * from the wire — so no caller can attribute events to somebody else.
 */
export const analyticsBeaconIsMarkedClientScenario = pikkuScenario<
  void,
  { accepted: number }
>({
  title: 'An event relayed from a browser is recorded as the client’s',
  description: 'The ingest takes the event; the identity stays the wire’s',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    const beacon = await scenario.when(
      'a visitor reports a page view',
      'sendsAnalyticsBeacon',
      {
        events: [
          { event: { name: 'page_viewed', path: '/' } satisfies DeclaredEvent },
        ],
      }
    )
    await scenario.then('the ingest accepted it', 'expectsBeaconStatus', {
      beacon,
      status: 200,
    })

    const recorded = await scenario.do(
      'reads the destination back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'it is the client’s event, not the server’s',
      'expectsRecordedEvent',
      {
        recorded,
        name: 'page_viewed',
        expected: { source: 'client', props: { path: '/' } },
      }
    )
    return { accepted: recorded.all.length }
  },
})

/**
 * The generated ingest validates against the declared union, so an event
 * nobody declared never reaches a destination. Without that, a typo'd name
 * becomes a metric that exists only in the vendor.
 */
export const analyticsUndeclaredEventIsRefusedScenario = pikkuScenario<
  void,
  { status: number }
>({
  title: 'An event nobody declared is refused at the ingest',
  description: 'The declared union is the schema, not documentation',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    const beacon = await scenario.when(
      'a visitor reports something undeclared',
      'sendsAnalyticsBeacon',
      { events: [{ event: { name: 'never_declared' } }] }
    )
    await scenario.then('the ingest refused it', 'expectsBeaconStatus', {
      beacon,
      status: 422,
    })

    const recorded = await scenario.do(
      'reads the destinations back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'nothing reached a destination',
      'expectsRecordedEvents',
      { recorded, all: [], conversions: [] }
    )
    return { status: beacon.status }
  },
})

/**
 * Storing an id on someone's device is the act consent governs, so the gate is
 * upstream of the write: a visitor who has not granted `analytics` is never
 * given one, rather than being given one whose events are then withheld.
 */
export const analyticsConsentGatesTheMintScenario = pikkuScenario<
  void,
  { minted: false }
>({
  title: 'No device id is minted before consent is given',
  description: 'The gate is on the storing, not on the sending',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    const refused = await scenario.when(
      'a visitor who has refused analytics reports a page view',
      'sendsAnalyticsBeacon',
      {
        events: [
          { event: { name: 'page_viewed', path: '/' } satisfies DeclaredEvent },
        ],
        cookie: 'e2e_consent=denied',
      }
    )
    await scenario.then('nothing was stored on the device', 'expectsNoMint', {
      beacon: refused,
    })

    const recorded = await scenario.do(
      'reads the destination back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'the event still arrived, carrying no device id',
      'expectsRecordedEvent',
      {
        recorded,
        name: 'page_viewed',
        expected: { source: 'client', anonymousId: undefined },
      }
    )
    return { minted: false }
  },
})

/**
 * Once per wire, not once per event: the resolver is consulted for every
 * record, and a second mint would give one visitor two identities. A returning
 * request carrying the cookie is answered with the id already stored.
 */
export const analyticsDeviceIdIsMintedOnceScenario = pikkuScenario<
  void,
  { stable: true }
>({
  title: 'A consenting visitor is minted one device id, and keeps it',
  description: 'A second mint would make one visitor two people',
  tags: ['scenario', 'analytics'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    const first = await scenario.when(
      'a consenting visitor reports two page views at once',
      'sendsAnalyticsBeacon',
      {
        events: [
          { event: { name: 'page_viewed', path: '/' } satisfies DeclaredEvent },
          {
            event: {
              name: 'page_viewed',
              path: '/pricing',
            } satisfies DeclaredEvent,
          },
        ],
        cookie: 'e2e_consent=1',
      }
    )
    const second = await scenario.when(
      'they come back carrying what was stored',
      'sendsAnalyticsBeacon',
      {
        events: [
          {
            event: {
              name: 'page_viewed',
              path: '/docs',
            } satisfies DeclaredEvent,
          },
        ],
        cookie: `e2e_consent=1; pikku_aid=${first.anonymousCookie}`,
      }
    )

    await scenario.then(
      'one id was written, and the return visit was not given another',
      'expectsStableDeviceId',
      { first, second }
    )
    return { stable: true }
  },
})

export const analyticsFeature = pikkuFeature({
  name: 'Analytics',
  description:
    'Events reach their destinations identified, gated by consent and filtered by policy',
  tags: ['analytics'],
  scenarios: [
    analyticsServerEventCarriesItsInvocationScenario,
    analyticsAcceptsKeepsAnEventOutScenario,
    analyticsBeaconIsMarkedClientScenario,
    analyticsUndeclaredEventIsRefusedScenario,
    analyticsConsentGatesTheMintScenario,
    analyticsDeviceIdIsMintedOnceScenario,
  ],
})
