import type {
  CoreUserSession,
  PikkuWire,
  PikkuWiringTypes,
} from '../types/core.types.js'

export type AnalyticsEventBase = { name: string } & Record<string, unknown>

export interface AnalyticsEventInput {
  name: string
  props?: Record<string, unknown>
  at?: number
}

/**
 * Stamped server-side from the session and never read from the request body,
 * which is what makes an unauthenticated ingest safe to expose.
 */
export interface AnalyticsIdentity {
  userId: string | null
  orgId?: string
  pikkuUserId?: string
  /**
   * Identifiers a destination keys on that pikku does not mint — GA4's
   * `client_id`, Meta's `fbp` and `fbc`, a vendor's own device id. All of them
   * originate in the browser, and a sink that cannot produce one does not
   * degrade, it sends nothing usable.
   *
   * Resolved server-side from first-party cookies on the request, never read
   * from the event body, on the same reasoning as the rest of this object: a
   * crafted client call must not be able to attribute an event to someone else.
   */
  vendorIds?: Record<string, string>
  /**
   * A device-scoped id for a visitor with no session, minted by pikku rather
   * than by a vendor.
   *
   * Distinct from `pikkuUserId`, which is derived from a session and is
   * therefore absent for exactly the visitor this identifies. Without it a
   * product-analytics sink has no honest option for anonymous traffic: keying
   * on a shared literal collapses every visitor into one person, and dropping
   * the event loses the whole pre-signup funnel.
   */
  anonymousId?: string
  /**
   * What the visitor agreed to, keyed by purpose. A sink gated on a purpose
   * absent here does not send.
   *
   * Open-ended rather than a fixed pair, because the purposes are the consent
   * tool's vocabulary and jurisdictions do not agree on them. Undefined means
   * the app wired no consent resolver, not that consent was refused — the gate
   * belongs to the sink, which is where the app decides what absence means.
   */
  consent?: Record<string, boolean>
}

/**
 * Resolves the half of the identity pikku cannot know, from the wire.
 *
 * A function rather than a cookie-name map because consent tools do not store
 * one boolean per cookie — a single encoded blob is more common — and a map
 * could only express the easy case. {@link cookieAnalyticsIdentity} covers that
 * easy case.
 */
export type AnalyticsIdentityResolver = (
  wire: PikkuWire<any, any, any, CoreUserSession>,
  /**
   * What the resolvers before this one produced, when composed. A minter needs
   * it: whether it may write a cookie at all depends on consent another
   * resolver read, and ordering is the only thing that can express that.
   */
  resolved?: Pick<AnalyticsIdentity, 'vendorIds' | 'consent' | 'anonymousId'>
) => Pick<AnalyticsIdentity, 'vendorIds' | 'consent' | 'anonymousId'> | undefined

export interface AnalyticsRecord {
  name: string
  props?: Record<string, unknown>
  occurredAt: string
  at?: number
  userIdentity: AnalyticsIdentity
  traceId?: string
  functionId?: string
  wireType?: PikkuWiringTypes
  source: 'server' | 'client'
}

/**
 * Where accepted events go. Pikku validates, identifies and batches them; it
 * does not store them.
 *
 * One method, taking a batch, because a batch is what a destination is always
 * handed: the invocation buffers and flushes once, and a lone event is a batch
 * of one. A single-event method beside it would be a second path every sink had
 * to implement and every caller had to choose between.
 */
export interface AnalyticsService {
  write(batch: AnalyticsRecord[]): Promise<void>
}

/**
 * One destination in a fan-out, with the events it is allowed to receive.
 *
 * `accepts` is the app's, not the sink's: which events a destination should get
 * is policy — a product-analytics tool wants everything, an ad platform wants
 * three conversions, and a consent gate reads the same way. What each event
 * should look like once it gets there is the sink's, and lives in its mapper.
 */
export interface AnalyticsSink {
  service: AnalyticsService
  accepts?: (record: AnalyticsRecord) => boolean
}

/**
 * Its presence, not `at`, is what marks a record as relayed from a browser — a
 * beacon is free to omit `at`.
 */
export interface AnalyticsClientContext {
  at?: number
}

/**
 * `services.analytics`: buffered for the invocation, flushed when it ends,
 * always best-effort. `record` is a method rather than a property so an app can
 * narrow `Events` in its own `SingletonServices`.
 */
export interface AnalyticsLog<
  Events extends AnalyticsEventBase = AnalyticsEventBase,
> {
  record(event: Events, client?: AnalyticsClientContext): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}
