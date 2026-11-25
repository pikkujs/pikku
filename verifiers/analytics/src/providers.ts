import { analyticsSinks } from '@pikku/core/analytics'
import type { AnalyticsRecord } from '@pikku/core/analytics'
import { defineProvider } from '#pikku/provider'

/** What the wire handed on, in the order the invocation flushed it. */
export const collectedAnalytics: AnalyticsRecord[][] = []

export const collectingSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({
    sink: {
      async write(batch: AnalyticsRecord[]) {
        collectedAnalytics.push(batch)
      },
    },
    map: {
      page_viewed: true,
      checkout_completed: true,
      profile_renamed: true,
    },
  }),
})
