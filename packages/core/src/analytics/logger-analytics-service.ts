import type { Logger } from '../services/logger.js'
import type { AnalyticsRecord, AnalyticsService } from './analytics.types.js'

/**
 * What an app gets before it has chosen a store. There is deliberately no noop:
 * a validated wire with nowhere for the events to go is indistinguishable from
 * a broken one.
 *
 * At `debug` so attaching a real store does not report every event twice.
 */
export class LoggerAnalyticsService implements AnalyticsService {
  constructor(private readonly logger: Logger) {}

  async record(event: AnalyticsRecord): Promise<void> {
    this.logger.debug(`analytics: ${event.name}`, {
      ...event.props,
      userId: event.userIdentity.userId,
      source: event.source,
      ...(event.at === undefined ? {} : { at: event.at }),
    })
  }

  async write(batch: AnalyticsRecord[]): Promise<void> {
    for (const event of batch) {
      await this.record(event)
    }
  }
}
