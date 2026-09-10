import { z } from 'zod'

/**
 * The union a project owns. Everything else about the ingest is generated from
 * it, which is the whole point of the verifier: nothing here wires a route.
 */
export const analyticsEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('page_viewed'),
    path: z.string().max(512),
  }),
  z.object({
    name: z.literal('checkout_completed'),
    amount: z.number(),
    currency: z.string().length(3),
  }),
])

export type AnalyticsEvent = z.infer<typeof analyticsEvent>
