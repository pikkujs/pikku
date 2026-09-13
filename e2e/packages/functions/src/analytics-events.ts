import { z } from 'zod'
import { defineAnalyticsEvents } from '#pikku/analytics'

/**
 * What the e2e app can measure. `report_viewed` is recorded by a server
 * function and `page_viewed` is what the browser beacon sends, so the suite
 * can tell a `source: 'server'` record from a `source: 'client'` one without
 * inspecting anything but the event name.
 */
export const analyticsEvents = defineAnalyticsEvents({
  report_viewed: z.object({ report: z.string() }),
  page_viewed: z.object({ path: z.string() }),
})
