import { z } from 'zod'
import { defineAnalyticsEvents } from '#pikku/analytics'

/** The one thing a project declares; the whole ingest is generated from it. */
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  checkout_completed: z.object({
    amount: z.number(),
    currency: z.string().length(3),
  }),
  /**
   * `name` is the discriminator the generated union is built on, so a props
   * schema that declares one of its own must not be able to displace it — the
   * union would have a non-literal key and throw on import.
   */
  profile_renamed: z.object({
    name: z.string().max(120),
    by: z.string(),
  }),
})
