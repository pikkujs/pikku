import type { PikkuWiringTypes } from '../types/core.types.js'

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
}

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
 * does not store them. Implement `write` when the destination takes a batch in
 * one call.
 */
export interface AnalyticsService {
  record(event: AnalyticsRecord): Promise<void>
  write?(batch: AnalyticsRecord[]): Promise<void>
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
