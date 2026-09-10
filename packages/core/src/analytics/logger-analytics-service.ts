import type { Logger } from '../services/logger.js'
import type { AnalyticsRecord, AnalyticsService } from './analytics.types.js'

/**
 * The service an app gets before it has chosen a store: every accepted event
 * is written to the app's own logger, one line each.
 *
 * There is deliberately no noop implementation. A declaration, a validated wire
 * and nowhere for the events to go is a pipeline you cannot tell apart from a
 * broken one — the endpoint answers `accepted: 1` whether or not anything is
 * collecting. Logging is the one destination every pikku app already has, so
 * this is what the runner installs when nothing else is wired.
 *
 * At `debug` rather than `info`: once a platform or a store is attached every
 * event would otherwise be reported twice, and people silence the duplicate by
 * removing the default — which puts them back at events going nowhere. Debug is
 * visible in `pikku dev` and quiet on a deployed stage.
 *
 * One line per event, not per batch: a batch is an artefact of how the browser
 * chose to flush, and grouping by it would put unrelated events on one line.
 */
export class LoggerAnalyticsService implements AnalyticsService {
  constructor(private readonly logger: Logger) {}

  async record(event: AnalyticsRecord): Promise<void> {
    // `debug` takes a message and meta rather than one object, so the name
    // leads the line and the props travel beside it — which also removes any
    // chance of a declared prop clobbering a reserved field.
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
