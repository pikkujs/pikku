import { z } from 'zod'
import { loggerAnalyticsSink, pikkuAnalytics } from '@pikku/core/analytics'

/**
 * What this app can measure, and where the events go. **Extend the union when
 * you add an event.**
 *
 * The union is the input schema of the generated `POST /analytics` ingest,
 * which is what makes it more than documentation: a name it does not declare
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
 *
 * The logger sink is the starting point, not the destination: swap it for one
 * that writes to your warehouse and every call site, schema and route stays as
 * it is.
 */
export const analytics = pikkuAnalytics({
  events: z.discriminatedUnion('name', [
    z.object({
      name: z.literal('page_viewed'),
      /** The route pattern, not the resolved path — a path carries ids. */
      path: z.string().max(512),
    }),
    z.object({
      name: z.literal('todo_created'),
      priority: z.enum(['low', 'medium', 'high']),
    }),
  ]),
  sink: loggerAnalyticsSink,
})

export type AnalyticsEvent = z.infer<(typeof analytics)['events']>
