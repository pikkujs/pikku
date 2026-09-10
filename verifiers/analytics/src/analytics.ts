import { z } from 'zod'
import { defineAnalyticsEvents } from '@pikku/core/analytics'

/** The one thing a project declares; the whole ingest is generated from it. */
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  checkout_completed: z.object({
    amount: z.number(),
    currency: z.string().length(3),
  }),
})
