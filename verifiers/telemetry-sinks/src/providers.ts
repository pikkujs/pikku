import { analyticsSinks } from '@pikku/core/analytics'
import type { AnalyticsRecord } from '@pikku/core/analytics'
import { defineProvider } from '#pikku/provider'

export const conversions: AnalyticsRecord[] = []

/** An analytics sink the app adds as a provider: it takes only the events its map names. */
export const conversionSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({
    sink: {
      write: async (batch: AnalyticsRecord[]) =>
        void conversions.push(...batch),
    },
    map: { checkout_completed: true },
  }),
})
