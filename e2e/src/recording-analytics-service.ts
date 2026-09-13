import type { AnalyticsRecord, AnalyticsService } from '@pikku/core/analytics'

/**
 * An analytics destination the suite can read back.
 *
 * The point of writing events to memory rather than to a vendor is that every
 * layer in front of the destination is still the real one: the request-scoped
 * buffer, the flush at the end of the invocation, the identity resolver and
 * the fan-out's `accepts` predicate all run exactly as they would in front of
 * a network sink. Only the last hop is replaced.
 */
export class RecordingAnalyticsService implements AnalyticsService {
  private readonly records: AnalyticsRecord[] = []

  async write(batch: AnalyticsRecord[]): Promise<void> {
    this.records.push(...batch)
  }

  read(): AnalyticsRecord[] {
    return [...this.records]
  }

  clear(): void {
    this.records.length = 0
  }
}
