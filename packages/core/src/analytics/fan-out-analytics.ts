import { defineProviderCollection } from '../provider/define-provider.js'
import type { ProviderCollectionEntry } from '../provider/provider.types.js'
import type {
  AnalyticsEventMap,
  AnalyticsEventSink,
  AnalyticsRecord,
  AnalyticsService,
} from './analytics.types.js'

/**
 * One analytics destination and the events it takes. Fails closed: a sink
 * receives only the events its map names. `TMap` is inferred from the sink,
 * never from the map.
 */
export type AnalyticsSinkItem<TMap extends AnalyticsEventMap = any> = {
  sink: AnalyticsEventSink<TMap>
  map: NoInfer<TMap>
  /** Called when the server stops, after what was built later has stopped. */
  stop?: () => void | Promise<void>
}

/**
 * The analytics sinks of this process. A provider adds one with
 * `defineProvider({ addTo: analyticsSinks, ... })`, returning the sink and the
 * events it receives; `fanOutAnalytics` reads the entries.
 *
 * @example snippet: registerAnalyticsSink
 */
export const analyticsSinks = defineProviderCollection<
  'analyticsSinks',
  AnalyticsSinkItem
>('analyticsSinks')

const prepared = new WeakSet<object>()

const prepare = ({
  label,
  item,
}: ProviderCollectionEntry<AnalyticsSinkItem>) => {
  if (prepared.has(item)) return
  if (item.map === null || typeof item.map !== 'object') {
    throw new Error(`analyticsSinks item '${label}' has no map`)
  }
  item.sink.setMap?.(item.map)
  prepared.add(item)
}

/**
 * One `AnalyticsService` over the `analyticsSinks` collection, read at write time.
 *
 * Settled, not awaited in sequence: `flush()` runs inside the invocation, so a
 * vendor that is slow must not add its latency to the request and a vendor that
 * is down must not cost the others their events. A destination that throws is
 * reported by the caller's existing flush guard, which already treats analytics
 * as best-effort. With no sink the batch goes to `fallback`.
 */
export const fanOutAnalytics = (
  sinks: readonly ProviderCollectionEntry<AnalyticsSinkItem>[] | undefined,
  fallback: AnalyticsService
): AnalyticsService => {
  const entries = (sinks ?? []).map((entry) => {
    prepare(entry)
    return {
      sink: entry.item.sink,
      names: new Set(Object.keys(entry.item.map)),
    }
  })
  return {
    async write(batch: AnalyticsRecord[]): Promise<void> {
      if (batch.length === 0) return
      if (entries.length === 0) return fallback.write(batch)

      const results = await Promise.allSettled(
        // Wrapped in an async function so a synchronous throw from one sink
        // rejects its own promise instead of escaping before `allSettled` runs.
        entries.map(async ({ sink, names }) => {
          const records = batch.filter((record) => names.has(record.name))
          if (records.length === 0) return
          await sink.write(records)
        })
      )

      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      )
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((failure) => failure.reason),
          `${failures.length} of ${entries.length} analytics destinations failed`
        )
      }
    },
  }
}
