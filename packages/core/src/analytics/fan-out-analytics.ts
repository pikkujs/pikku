import type {
  AnalyticsEventMap,
  AnalyticsEventSink,
  AnalyticsRecord,
  AnalyticsService,
} from './analytics.types.js'

interface Registered {
  sink: AnalyticsService
  names: ReadonlySet<string>
}

/**
 * The analytics sinks of this process. Core creates one before the app's
 * `createSingletonServices` runs and hands it in as `analyticsSinks`; the app
 * registers sinks in plain code. Fails closed: a sink receives only the events
 * its map names.
 *
 * @example snippet: registerAnalyticsSink
 */
export class AnalyticsSinkRegistry {
  private readonly registered: Registered[] = []

  /**
   * Registers a sink for the events named by the keys of `map`. `TMap` is
   * inferred from the sink, never from the map argument.
   */
  add<TMap extends AnalyticsEventMap = AnalyticsEventMap>(
    sink: AnalyticsEventSink<TMap>,
    map: NoInfer<TMap>
  ): void {
    if (map === null || typeof map !== 'object') {
      throw new Error(
        'analyticsSinks.add needs a map of the events the sink receives'
      )
    }
    sink.setMap?.(map)
    this.registered.push({ sink, names: new Set(Object.keys(map)) })
  }

  /** The registered sinks and the events each takes; read at write time, never cached. */
  entries(): readonly Registered[] {
    return this.registered
  }
}

/**
 * A new, empty registry, for a runtime that does not go through `pikku dev`, `serve` or a standalone build.
 *
 * @example snippet: registerAnalyticsSink
 */
export const createAnalyticsSinks = (): AnalyticsSinkRegistry =>
  new AnalyticsSinkRegistry()

/**
 * One `AnalyticsService` over the registry, read at write time.
 *
 * Settled, not awaited in sequence: `flush()` runs inside the invocation, so a
 * vendor that is slow must not add its latency to the request and a vendor that
 * is down must not cost the others their events. A destination that throws is
 * reported by the caller's existing flush guard, which already treats analytics
 * as best-effort. With no sink registered the batch goes to `fallback`.
 */
export const fanOutAnalytics = (
  registry: AnalyticsSinkRegistry | undefined,
  fallback: AnalyticsService
): AnalyticsService => ({
  async write(batch: AnalyticsRecord[]): Promise<void> {
    if (batch.length === 0) return
    const entries = registry?.entries() ?? []
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
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        `${failures.length} of ${entries.length} analytics destinations failed`
      )
    }
  },
})
