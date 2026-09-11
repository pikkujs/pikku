import { z } from 'zod'
import { defineAnalyticsEvents } from '@pikku/core/analytics'

/**
 * What this app can measure — add a key when you add an event. This is the
 * input schema of both `POST /analytics` and `services.analytics.record()`, so
 * an undeclared name fails to compile and is rejected at the wire.
 *
 * Measure outcomes rather than clicks, and keep props low-cardinality: they
 * become queryable columns, and identity is already stamped server-side.
 *
 * With nothing wired the events are logged; set `analyticsService` in
 * `services.ts` to send them elsewhere.
 */
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  todo_created: z.object({
    priority: z.enum(['low', 'medium', 'high']),
  }),
})
