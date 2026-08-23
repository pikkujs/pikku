import { z } from 'zod'

/**
 * The analytics event registry — the one place this app declares what can be
 * measured. **Extend this union when you add an event.**
 *
 * It is a discriminated union on `name`, used directly as the input schema of
 * the `/analytics` ingest. That is what makes it more than documentation:
 *
 * - A typo is a build error rather than a silently forked series that fragments
 *   the dashboard and is noticed weeks later.
 * - The schema flows to the browser through the generated client, so
 *   `analytics.event('checkout_completed', { … })` is typed at the call site.
 * - The schema ships with the deployment's meta, so the dashboard knows this app
 *   has `checkout_completed` with a numeric `amount` and can render revenue over
 *   time rather than `COUNT(*) GROUP BY name`.
 *
 * Two rules for what belongs here:
 *
 * - **Measure outcomes, not clicks.** `checkout_completed` is worth a chart;
 *   `button_clicked` is not. Fire outcome events from the `onSuccess` of the
 *   mutation that produced them, where the result is actually known.
 * - **Keep props low-cardinality.** They are queryable columns on the raw
 *   stream. A user id or an order id as a prop is a cardinality problem and,
 *   worse, personal data in an analytics store — identity is already stamped
 *   server-side from the session.
 */
export const analyticsEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('page_viewed'),
    path: z.string().max(512),
  }),
  z.object({
    name: z.literal('signed_up'),
  }),
  z.object({
    name: z.literal('checkout_completed'),
    amount: z.number(),
    currency: z.string().length(3),
  }),
])

export type AnalyticsEvent = z.infer<typeof analyticsEvent>
