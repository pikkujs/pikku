/**
 * What this app measures.
 *
 * A screen records one with `useAnalytics().event('signed_up', {})` (lib/product.ts)
 * and a function with `analytics.record({ name: 'signed_up' })`. The `POST /analytics`
 * ingest is generated from this declaration (`scaffold.analytics`), a typo in an
 * event name is a build error on both sides, and the schema reaches the browser
 * through `AnalyticsEvent`. `page_viewed` and `signed_up` are PLACEHOLDERS: REPLACE
 * them with the events this app actually cares about.
 *
 * Where events go is not decided here: each environment provides its
 * `analyticsService`, and Studio's Metrics screen reads what arrives.
 *
 * Two rules for what belongs here:
 *
 *  - Measure outcomes, not clicks. `checkout_completed` is worth a chart;
 *    `button_clicked` is not. Record an outcome in the function that made it
 *    happen: the server knows it happened, and a blocked beacon cannot lose it.
 *  - Keep props low-cardinality. They are queryable columns on the raw stream. A
 *    user id or an order id as a prop is a cardinality problem and personal data in
 *    an analytics store — identity is stamped server-side from the session.
 *
 * The catalog is read off the declaration at build time, not off a record, so
 * an event lists here before anyone has fired it — which is exactly the event
 * someone is looking for when they open the screen.
 */
import { z } from 'zod'
import { defineAnalyticsEvents } from '#pikku/analytics'

export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  signed_up: z.object({}),
})
