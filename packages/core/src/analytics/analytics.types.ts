import type {
  CoreUserSession,
  PikkuWire,
  PikkuWiringTypes,
} from '../types/core.types.js'

/**
 * The constraint a project's declared event union is checked against.
 *
 * Only `name` is fixed, because the name is the whole of what pikku itself
 * reads — everything else on an event belongs to the app and to the sinks it
 * wires, and narrowing it here would make the generic useless for anyone whose
 * events carry more than a fixed set of props.
 */
export type AnalyticsEventBase = {
  /** The event name, as declared in `defineAnalyticsEvents`. */
  name: string
} & Record<string, unknown>

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
  /** The session's user id, or null for a visitor with no session. */
  userId: string | null
  /** The session's organization, when it has one. */
  orgId?: string
  /** The pikku user the session resolves to; absent without a session. */
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
) =>
  Pick<AnalyticsIdentity, 'vendorIds' | 'consent' | 'anonymousId'> | undefined

/**
 * What an event becomes once pikku has accepted it, and the only shape an
 * {@link AnalyticsService} is ever handed.
 *
 * Distinct from {@link AnalyticsEventInput}, which is what a caller submits:
 * the identity, the trace and the origin are stamped server-side on the way
 * through, so a sink never has to trust — or re-derive — any of them.
 */
export interface AnalyticsRecord {
  /** The event name. */
  name: string
  /** The validated props the event carried. */
  props?: Record<string, unknown>
  /** When the server accepted the event, as an ISO timestamp. */
  occurredAt: string
  /** When a browser says it happened, in epoch milliseconds; only on relayed events. */
  at?: number
  /** Who the event is attributed to, stamped from the session and cookies. */
  userIdentity: AnalyticsIdentity
  /** The trace the emitting invocation belongs to. */
  traceId?: string
  /** The function that recorded the event, when one did. */
  functionId?: string
  /** The kind of wire the event came in on. */
  wireType?: PikkuWiringTypes
  /** `client` when relayed from a browser, `server` when a function recorded it. */
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
  /** Delivers one batch of accepted records; a rejection is logged, never surfaced to the caller. */
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
  /** The destination the filtered records are written to. */
  service: AnalyticsService
  /** Returns true for the records this destination should get; omit to send everything. */
  accepts?: (record: AnalyticsRecord) => boolean
}

/**
 * Its presence, not `at`, is what marks a record as relayed from a browser — a
 * beacon is free to omit `at`.
 */
export interface AnalyticsClientContext {
  /** When the browser says the event happened, in epoch milliseconds. */
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
  /** Buffers an event for the invocation; pass `client` when relaying one from a browser. */
  record(event: Events, client?: AnalyticsClientContext): Promise<void>
  /** Writes what is buffered to the service now, rather than when the invocation ends. */
  flush(): Promise<void>
  /** Flushes and stops accepting events; called for you when the invocation ends. */
  close(): Promise<void>
}

/**
 * One declared event, as an administration surface sees it.
 *
 * Read off the declaration at build time rather than from a record: the catalog
 * has to list an event nobody has fired yet, which is exactly the event someone
 * is looking for when they open it.
 */
export interface AnalyticsEventMeta {
  /** The event name a client emits, exactly as the declaration spells it. */
  name: string
  /** The module holding the `defineAnalyticsEvents` call that declares it. */
  file: string
  /** The name that module exports the declaration under. */
  variable: string
  /**
   * The event's props, keyed by name, valued with the schema's own source text
   * (`z.string()`). Absent where the shape is not an object literal the
   * inspector can read — a shared const, a union, a non-zod vendor.
   */
  props?: Record<string, string>
}

/** Declared analytics events, keyed by event name. */
export type AnalyticsEventsMeta = Record<string, AnalyticsEventMeta>
