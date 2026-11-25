import {
  analyticsSinks,
  assertAnalyticsSinksDeclared,
  getDeclaredAnalyticsEvents,
  type AnalyticsEventSink,
  type AnalyticsSinkItem,
} from '@pikku/core/analytics'
import { defineProvider } from '@pikku/core/provider'
import type { ProviderCollectionEntry } from '@pikku/core/provider'

/*
 * Outside `src/`, so `pikku all` does not read it as a real provider: the shop's
 * tsconfig still compiles it.
 */
// @snippet start registerAnalyticsSink
const conversions: AnalyticsEventSink = {
  write: async (events) => console.debug('conversions', events.length),
}
// A provider adds one sink to the `analyticsSinks` collection. Only the events
// named in its map reach it; any other is dropped.
export const conversionsSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({ sink: conversions, map: { checkout_completed: true } }),
})
// @snippet end registerAnalyticsSink

// @snippet start declaredAnalyticsEvents
const warehouse: AnalyticsEventSink = {
  write: async (events) => console.debug('warehouse', events.length),
}
// Every event the app declares, as the generated bootstrap registered them.
export const warehouseSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({
    sink: warehouse,
    map: Object.fromEntries(
      getDeclaredAnalyticsEvents().map((name) => [name, true])
    ),
  }),
})
// Refuses to start when a sink is present but no event is declared.
export const checkSinks = (
  sinks: readonly ProviderCollectionEntry<AnalyticsSinkItem>[]
) => assertAnalyticsSinksDeclared(sinks)
// @snippet end declaredAnalyticsEvents
