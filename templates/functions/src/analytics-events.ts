import { z } from 'zod'

/**
 * What this app can measure. **Extend this union when you add an event.**
 *
 * It is the input schema of the generated `POST /analytics` ingest, which is
 * what makes it more than documentation: a name the union does not declare
 * fails to compile at the call site and is rejected at the wire, rather than
 * quietly becoming a second series that fragments the dashboard.
 *
 * Two rules for what belongs here:
 *
 * - **Measure outcomes, not clicks.** `checkout_completed` is worth a chart;
 *   `button_clicked` is not. Fire an outcome from the place that knows it
 *   happened — the success path of the call that produced it.
 * - **Keep props low-cardinality.** They become queryable columns wherever the
 *   sink stores them. A user id or an order id is both a cardinality problem
 *   and personal data in an analytics store; identity is already stamped
 *   server-side from the session.
 */
export const analyticsEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('page_viewed'),
    /** The route pattern, not the resolved path — a path carries ids. */
    path: z.string().max(512),
  }),
  z.object({
    name: z.literal('todo_created'),
    priority: z.enum(['low', 'medium', 'high']),
  }),
])

export type AnalyticsEvent = z.infer<typeof analyticsEvent>
