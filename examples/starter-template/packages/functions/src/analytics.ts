/**
 * What this app measures.
 *
 * Event names are the wire names the browser sends (`analytics.event('signed_up', {})`),
 * and the `POST /analytics` ingest is generated from this declaration
 * (`scaffold.analytics`) — a typo in an event name is a build error, and the schema
 * reaches the browser through `AnalyticsEvent`. `page_viewed` and `signed_up` are
 * PLACEHOLDERS: REPLACE them with the events this app actually cares about.
 *
 * Where events go is not decided here. A deployed stage gets fabric's OpenObserve
 * `analyticsService`; locally they are logged.
 *
 * Two rules for what belongs here:
 *
 *  - Measure outcomes, not clicks. `checkout_completed` is worth a chart;
 *    `button_clicked` is not. Fire outcome events from the `onSuccess` of the
 *    mutation that produced them.
 *  - Keep props low-cardinality. They are queryable columns on the raw stream. A
 *    user id or an order id as a prop is a cardinality problem and personal data in
 *    an analytics store — identity is stamped server-side from the session.
 *
 * The catalog is read off the declaration at build time, not off a record, so
 * an event lists here before anyone has fired it — which is exactly the event
 * someone is looking for when they open the screen.
 */
import { z } from 'zod'
import { defineAnalyticsEvents } from '@pikku/core/analytics'

export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  signed_up: z.object({}),
})
