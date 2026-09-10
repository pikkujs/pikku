import { z } from 'zod'
import { pikkuAnalytics } from '@pikku/core/analytics'

/**
 * The one declaration a project makes. Everything else about the ingest is
 * generated from it, which is the whole point of the verifier: nothing here
 * wires a route.
 *
 * No sink: the tests register their own to read what the wire accepted, and a
 * declaration without one still has to produce a working, validating endpoint.
 */
export const analytics = pikkuAnalytics({
  events: z.discriminatedUnion('name', [
    z.object({
      name: z.literal('page_viewed'),
      path: z.string().max(512),
    }),
    z.object({
      name: z.literal('checkout_completed'),
      amount: z.number(),
      currency: z.string().length(3),
    }),
  ]),
})

export type AnalyticsEvent = z.infer<(typeof analytics)['events']>
