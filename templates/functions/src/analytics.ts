import { z } from 'zod'
import { defineAnalyticsEvents } from '@pikku/core/analytics'

/**
 * What this app can measure. **Add a key when you add an event.**
 *
 * The declaration is the input schema of the generated `POST /analytics` ingest
 * and of `services.analytics.record()`, which is what makes it more than
 * documentation: a name it does not declare fails to compile at the call site
 * and is rejected at the wire, rather than quietly becoming a second series
 * that fragments the dashboard.
 *
 * Two rules for what belongs here:
 *
 * - **Measure outcomes, not clicks.** `checkout_completed` is worth a chart;
 *   `button_clicked` is not. Fire an outcome from the place that knows it
 *   happened — the success path of the call that produced it.
 * - **Keep props low-cardinality.** They become queryable columns wherever the
 *   service stores them. A user id or an order id is both a cardinality problem
 *   and personal data in an analytics store; identity is already stamped
 *   server-side from the session.
 *
 * Where the events go is not decided here. With nothing wired they are logged;
 * set `analyticsService` in `services.ts` to send them somewhere else, and
 * every call site, schema and route stays as it is.
 */
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    /** The route pattern, not the resolved path — a path carries ids. */
    path: z.string().max(512),
  }),
  todo_created: z.object({
    priority: z.enum(['low', 'medium', 'high']),
  }),
})
