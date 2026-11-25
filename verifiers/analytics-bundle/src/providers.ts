import {
  analyticsSinks,
  getDeclaredAnalyticsEvents,
  type AnalyticsRecord,
} from '@pikku/core/analytics'
import { defineProvider } from '#pikku/provider'

export const delivered: AnalyticsRecord[] = []

/**
 * Adds the sink the way a platform contributor does: for every event the app
 * declares, read from runtime state rather than from a meta file on disk.
 */
export const warehouse = defineProvider({
  addTo: analyticsSinks,
  common: () => ({
    sink: {
      write: async (batch: AnalyticsRecord[]) => void delivered.push(...batch),
    },
    map: Object.fromEntries(
      getDeclaredAnalyticsEvents().map((name) => [name, true])
    ),
  }),
})
