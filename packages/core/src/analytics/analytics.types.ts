import type { PikkuWiringTypes } from '../types/core.types.js'

/**
 * The least an analytics event can be: a name, and whatever props the app
 * declared alongside it.
 *
 * Every analytics type is generic over this rather than over the app's own
 * union, so core can carry the plumbing without knowing what the app measures.
 */
export type AnalyticsEventBase = { name: string } & Record<string, unknown>

/**
 * One event as it arrives from a browser beacon.
 *
 * `name` is the discriminator the app's own declaration provides; `props` is
 * what remains of that event once the discriminator is removed. Keeping the
 * two apart is what lets a service store the name as a series and the props as
 * queryable columns without re-deriving the split.
 */
export interface AnalyticsEventInput {
  name: string
  props?: Record<string, unknown>
  /** Client-supplied timestamp (ms). A service decides how far it will trust it. */
  at?: number
}

/**
 * Who the events belong to.
 *
 * Stamped server-side from the session and never read from the request body —
 * that is what makes an unauthenticated ingest safe to expose, because there is
 * no field a caller could set to attribute events to someone else. An anonymous
 * visitor records `null` rather than a generated visitor id: no device storage,
 * no consent banner, nothing to reconcile later.
 */
export interface AnalyticsIdentity {
  userId: string | null
  orgId?: string
  pikkuUserId?: string
}

/**
 * One event as an {@link AnalyticsService} receives it: the app's event plus
 * everything the invocation knew and the app should not have had to pass.
 *
 * `source` is the only field that distinguishes a page view posted by the
 * browser from an outcome recorded by a function, so both can land in one
 * series without the store guessing.
 */
export interface AnalyticsRecord {
  name: string
  props?: Record<string, unknown>
  /** When the server accepted it (ISO 8601). */
  occurredAt: string
  /** The client's own clock, present only for events a browser sent. */
  at?: number
  userIdentity: AnalyticsIdentity
  traceId?: string
  functionId?: string
  wireType?: PikkuWiringTypes
  source: 'server' | 'client'
}

/**
 * Where accepted events go.
 *
 * Pikku validates, identifies and batches events; it does not store them. This
 * is the one swappable slot: `pikku dev` installs a logging implementation when
 * an app has not chosen one, a platform injects its own through singleton
 * services, and an app that wants neither sets `analyticsService` in its own
 * `services.ts`, which runs last and wins.
 *
 * `write` is optional. Implement it when the destination can take a batch in
 * one call — the invocation buffer always has the whole batch to hand.
 */
export interface AnalyticsService {
  record(event: AnalyticsRecord): Promise<void>
  write?(batch: AnalyticsRecord[]): Promise<void>
}

/**
 * What a function records through: `services.analyticsLog`.
 *
 * Buffered for the length of the invocation and flushed when it ends, so a
 * function that records three events costs the destination one write. Always
 * best-effort — unlike an audit there is no transactional mode, because a lost
 * page view is not an incident and no caller can act on the failure.
 *
 * Generic over the app's union, which an app narrows in its own
 * `SingletonServices`. `record` is declared as a method rather than a property
 * so that narrowing is allowed.
 */
/**
 * Marks a record as relayed from a browser rather than produced by a function.
 *
 * Passed by the generated ingest and by nothing else. The presence of the
 * object is what sets `source: 'client'` — not the presence of `at`, which a
 * beacon is free to omit and which would otherwise silently relabel the event
 * as server-side.
 */
export interface AnalyticsClientContext {
  /** The client's own clock (ms). */
  at?: number
}

export interface AnalyticsLog<
  Events extends AnalyticsEventBase = AnalyticsEventBase,
> {
  record(event: Events, client?: AnalyticsClientContext): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}
