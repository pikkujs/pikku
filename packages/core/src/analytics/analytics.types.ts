import type { CoreSecretlessSingletonServices } from '../types/core.types.js'

/**
 * One product-analytics event, already flattened for a sink.
 *
 * `name` is the discriminator the app's own registry declares; `props` is what
 * remains of that event once the discriminator is removed. Keeping the two
 * apart is what lets a sink store the name as a series and the props as
 * queryable columns without re-deriving the split.
 */
export interface AnalyticsEventInput {
  name: string
  props?: Record<string, unknown>
  /** Client-supplied timestamp (ms). A sink decides how far it will trust it. */
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
}

/**
 * Where accepted events go.
 *
 * Pikku validates, flattens and identifies events; it does not store them. A
 * platform registers a sink to forward them somewhere (a queue, a stream, a
 * table). With no sink registered the ingest still validates and still answers,
 * and the events are dropped — a self-hosted app that has not wired a backend
 * gets a working, typed endpoint rather than a 500.
 */
export type AnalyticsSink = (
  services: CoreSecretlessSingletonServices,
  events: AnalyticsEventInput[],
  identity: AnalyticsIdentity
) => Promise<void>
