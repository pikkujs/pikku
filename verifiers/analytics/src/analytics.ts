import { z } from 'zod'
import { defineAnalyticsEvents } from '@pikku/core/analytics'

/**
 * The one thing a project declares. Everything else about the ingest is
 * generated from it, which is the whole point of the verifier: nothing here
 * wires a route, and nothing here says where events go.
 *
 * The tests install their own `analyticsService` to read what the wire
 * accepted; a project that installs none still has to get a working,
 * validating endpoint.
 */
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  checkout_completed: z.object({
    amount: z.number(),
    currency: z.string().length(3),
  }),
})
