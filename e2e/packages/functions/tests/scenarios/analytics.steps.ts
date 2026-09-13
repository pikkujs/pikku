/**
 * The two generated wires that no persona can reach.
 *
 * `POST /analytics` and `GET /feature-flags` are both declared `auth: false` —
 * an anonymous visitor is most of what analytics measures, and a signed-out
 * page still renders. A persona always carries its session, so a step that
 * asserts what an anonymous caller gets has to send the request itself.
 *
 * Set-Cookie is read off the response rather than through a cookie jar,
 * because what these scenarios assert is the *minting*: that a device id is
 * written once, reused on the next request, and never written at all before
 * consent. A jar would hide exactly that.
 */
import { pikkuScenarioStep, requireScenarioEnv } from '#pikku/scenario'

/** What the wire answered, plus any cookies it asked the browser to keep. */
export interface BeaconResult {
  status: number
  serialized: string
  setCookie: string[]
  /** The value of the minted device cookie, where one was written. */
  anonymousCookie?: string
}

const cookieValue = (setCookie: string[], name: string): string | undefined => {
  const header = setCookie.find((value) => value.startsWith(`${name}=`))
  return header?.slice(name.length + 1).split(';')[0]
}

export const sendsAnalyticsBeacon = pikkuScenarioStep<
  {
    /**
     * The body verbatim. Untyped here on purpose: a step's input becomes a
     * schema, the declared event union does not survive that translation, and
     * one scenario has to post an event the union does not contain. The
     * feature files pin the good ones with `satisfies AnalyticsEvent`.
     */
    events: Array<{ at?: number; event: Record<string, unknown> }>
    /** Sent verbatim as the `cookie` header, as a returning visitor would. */
    cookie?: string
  },
  BeaconResult
>({
  name: 'sendsAnalyticsBeacon',
  description: 'posts events to the generated ingest as an anonymous visitor',
  template: 'sends {events} to the analytics ingest',
  default: async (_services, { events, cookie }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const response = await fetch(`${apiUrl}/analytics`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ events }),
    })
    const setCookie = response.headers.getSetCookie()
    return {
      status: response.status,
      serialized: await response.text().catch(() => ''),
      setCookie,
      anonymousCookie: cookieValue(setCookie, 'pikku_aid'),
    }
  },
})

/** Every declared flag as the client wire reports it, for one caller. */
export interface FlagMapResult {
  status: number
  serialized: string
  flags: Record<string, boolean>
}

export const readsFeatureFlags = pikkuScenarioStep<
  { cookie?: string },
  FlagMapResult
>({
  name: 'readsFeatureFlags',
  description: 'asks the generated wire for every flag resolved for the caller',
  template: 'reads the feature flag map',
  default: async (_services, { cookie }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const response = await fetch(`${apiUrl}/feature-flags`, {
      headers: cookie ? { cookie } : {},
    })
    const serialized = await response.text().catch(() => '')
    return {
      status: response.status,
      serialized,
      flags: serialized ? JSON.parse(serialized) : {},
    }
  },
})

/**
 * The flag map, checked as a whole rather than key by key.
 *
 * The absence check is the load-bearing half: the wire must answer booleans
 * and nothing else, because sending `available` beside `capable` would tell
 * every signed-out visitor which features exist but are dark.
 */
export const expectsFlagMap = pikkuScenarioStep<
  { map: FlagMapResult; show: Record<string, boolean> },
  { checked: number }
>({
  name: 'expectsFlagMap',
  description: 'expects each flag to resolve as stated, and nothing else sent',
  template: 'expects the map to read {show}',
  default: async (_services, { map, show }) => {
    if (map.status !== 200) {
      throw new Error(`Expected 200 from /feature-flags, got ${map.status}`)
    }
    for (const [name, expected] of Object.entries(show)) {
      if (map.flags[name] !== expected) {
        throw new Error(
          `Expected ${name} to resolve ${expected}, got ${String(map.flags[name])}: ${map.serialized}`
        )
      }
    }
    for (const leak of ['available', 'capable']) {
      if (map.serialized.includes(leak)) {
        throw new Error(
          `The client map must not carry '${leak}': ${map.serialized}`
        )
      }
    }
    return { checked: Object.keys(show).length }
  },
})

/** One event as `readAnalytics` reports it. */
interface RecordedEvent {
  name: string
  source: 'server' | 'client'
  props?: Record<string, unknown>
  functionId?: string
  traceId?: string
  userId?: string | null
  anonymousId?: string
}

/**
 * What reached a destination, asserted as an ordered list of names.
 *
 * Names rather than whole records because the two lists are compared against
 * each other — the difference between everything the app emitted and what the
 * fan-out's `accepts` let through IS the policy under test.
 */
export const expectsRecordedEvents = pikkuScenarioStep<
  {
    recorded: { all: RecordedEvent[]; conversions: RecordedEvent[] }
    all?: string[]
    conversions?: string[]
  },
  { all: number; conversions: number }
>({
  name: 'expectsRecordedEvents',
  description: 'expects each destination to have seen exactly these events',
  template: 'expects {all} to have been recorded',
  default: async (_services, { recorded, all, conversions }) => {
    const check = (
      label: string,
      got: RecordedEvent[],
      want: string[] | undefined
    ) => {
      if (want === undefined) return
      const names = got.map((event) => event.name)
      if (names.join(',') !== want.join(',')) {
        throw new Error(
          `Expected ${label} to have seen [${want.join(', ')}], saw [${names.join(', ')}]`
        )
      }
    }
    check('every destination', recorded.all, all)
    check('the conversions destination', recorded.conversions, conversions)
    return {
      all: recorded.all.length,
      conversions: recorded.conversions.length,
    }
  },
})

/** One recorded event, checked field by field against what it should carry. */
export const expectsRecordedEvent = pikkuScenarioStep<
  {
    recorded: { all: RecordedEvent[] }
    name: string
    expected: Partial<RecordedEvent> & { hasTraceId?: boolean }
  },
  { found: true }
>({
  name: 'expectsRecordedEvent',
  description: 'expects one recorded event to carry the stated identity',
  template: 'expects {name} to carry {expected}',
  default: async (_services, { recorded, name, expected }) => {
    const event = recorded.all.find((candidate) => candidate.name === name)
    if (!event) {
      throw new Error(
        `No ${name} was recorded; saw [${recorded.all.map((e) => e.name).join(', ')}]`
      )
    }
    const { hasTraceId, ...fields } = expected
    if (hasTraceId !== undefined && Boolean(event.traceId) !== hasTraceId) {
      throw new Error(
        `Expected ${name} ${hasTraceId ? 'to carry' : 'not to carry'} a trace id, got ${String(event.traceId)}`
      )
    }
    for (const [key, want] of Object.entries(fields)) {
      const got = (event as unknown as Record<string, unknown>)[key]
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `Expected ${name}.${key} to be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
        )
      }
    }
    return { found: true }
  },
})

/**
 * What the ingest answered.
 *
 * A refusal is asserted by status alone: the point is that the generated schema
 * turned the request away, not how it worded it.
 */
export const expectsBeaconStatus = pikkuScenarioStep<
  { beacon: BeaconResult; status: number },
  { status: number }
>({
  name: 'expectsBeaconStatus',
  description: 'expects the analytics ingest to have answered with a status',
  template: 'expects the ingest to answer {status}',
  default: async (_services, { beacon, status }) => {
    if (beacon.status !== status) {
      throw new Error(
        `Expected ${status} from /analytics, got ${beacon.status}: ${beacon.serialized}`
      )
    }
    return { status: beacon.status }
  },
})

/**
 * Nothing was stored on the visitor's device.
 *
 * Asserted on Set-Cookie rather than on the recorded event, because consent
 * governs the storing: a visitor who refused must not be given an id at all,
 * which is a stronger claim than being given one whose events are dropped.
 */
export const expectsNoMint = pikkuScenarioStep<
  { beacon: BeaconResult },
  { minted: false }
>({
  name: 'expectsNoMint',
  description: 'expects no device id to have been written to the visitor',
  template: 'expects nothing to have been stored on the device',
  default: async (_services, { beacon }) => {
    if (beacon.anonymousCookie !== undefined) {
      throw new Error(
        `A device id was minted without consent: ${beacon.setCookie.join(' | ')}`
      )
    }
    return { minted: false }
  },
})

/**
 * One id per visitor, across a batch and across requests.
 *
 * The first request carries two events, so a resolver that ran per record
 * rather than per wire would write two different ids; the second carries the
 * cookie back, so a resolver that minted unconditionally would replace it. Both
 * failures split one visitor into several people, which is the whole thing a
 * device id exists to prevent.
 */
export const expectsStableDeviceId = pikkuScenarioStep<
  { first: BeaconResult; second: BeaconResult },
  { anonymousId: string }
>({
  name: 'expectsStableDeviceId',
  description: 'expects one device id to be minted once and then reused',
  template: 'expects the device id to be minted once and kept',
  default: async (_services, { first, second }) => {
    const minted = first.setCookie.filter((value) =>
      value.startsWith('pikku_aid=')
    )
    if (minted.length !== 1) {
      throw new Error(
        `Expected one device id to be written, got ${minted.length}: ${first.setCookie.join(' | ')}`
      )
    }
    if (second.anonymousCookie !== undefined) {
      throw new Error(
        `A returning visitor was minted a second device id: ${second.setCookie.join(' | ')}`
      )
    }
    return { anonymousId: first.anonymousCookie! }
  },
})
