import { z } from 'zod'
import { defineAnalyticsEvents } from '#pikku/analytics'

/**
 * What this app can measure — the one place it is declared, and the whole
 * `/analytics` ingest is generated from it.
 *
 * `defineAnalyticsEvents` registers nothing at runtime. The CLI unions every
 * declaration in the project into the ingest's input schema, so a typo is a
 * build error rather than a silently forked series, and ships the same shape in
 * the deployment's meta, so the console's catalog knows this app has
 * `checkout_completed` with a numeric `amount` and can chart revenue rather
 * than `COUNT(*) GROUP BY name`.
 *
 * Two rules for what belongs here:
 *
 * - **Measure outcomes, not clicks.** `checkout_completed` is worth a chart;
 *   `button_clicked` is not. Record an outcome where the result is actually
 *   known — the `onSuccess` of the mutation that produced it.
 * - **Keep props low-cardinality, and never personal.** They are queryable
 *   columns on the raw stream. A user or order id is both a cardinality problem
 *   and personal data in an analytics store; identity is stamped server-side
 *   from the session and must not be passed as a prop.
 *
 * `name` is the discriminator the generated union is built on, so no event
 * declares a prop of its own called `name` — the union would have a
 * non-literal key and throw on import.
 */
// @snippet start analyticsEvents
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  signed_up: z.object({}),
  checkout_completed: z.object({
    amount: z.number(),
    currency: z.string().length(3),
  }),
})
// @snippet end analyticsEvents
