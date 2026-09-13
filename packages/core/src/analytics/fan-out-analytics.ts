import type {
  AnalyticsRecord,
  AnalyticsService,
  AnalyticsSink,
} from './analytics.types.js'

const writeTo = async (
  service: AnalyticsService,
  batch: AnalyticsRecord[]
): Promise<void> => {
  if (service.write) {
    await service.write(batch)
    return
  }
  for (const record of batch) {
    await service.record(record)
  }
}

/**
 * One `AnalyticsService` over several destinations.
 *
 * A composite rather than a change to the interface, so a single-destination
 * app never meets it and a sink is the same class whether it runs alone or
 * beside three others.
 *
 * Settled, not awaited in sequence: `flush()` runs inside the invocation, so a
 * vendor that is slow must not add its latency to the request and a vendor that
 * is down must not cost the others their events. A destination that throws is
 * reported by the caller's existing flush guard, which already treats analytics
 * as best-effort.
 */
export const fanOutAnalytics = (
  sinks: ReadonlyArray<AnalyticsSink | AnalyticsService>
): AnalyticsService => {
  const resolved: AnalyticsSink[] = sinks.map((sink) =>
    'service' in sink ? sink : { service: sink }
  )

  return {
    async record(event: AnalyticsRecord): Promise<void> {
      await this.write!([event])
    },

    async write(batch: AnalyticsRecord[]): Promise<void> {
      if (batch.length === 0) return

      const results = await Promise.allSettled(
        resolved.map(({ service, accepts }) => {
          const records = accepts ? batch.filter(accepts) : batch
          return records.length === 0
            ? Promise.resolve()
            : writeTo(service, records)
        })
      )

      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      )
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((failure) => failure.reason),
          `${failures.length} of ${resolved.length} analytics destinations failed`
        )
      }
    },
  }
}
