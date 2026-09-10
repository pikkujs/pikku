import type { AnalyticsSink } from './analytics.types.js'

/**
 * The sink an app gets before it has chosen a store: every accepted event is
 * written to the app's own logger, one line each.
 *
 * A registry, a validated wire and nowhere for the events to go is a pipeline
 * you cannot tell apart from a broken one — the endpoint answers `accepted: 1`
 * whether or not anything is collecting. Logging is the one destination every
 * pikku app already has, so turning `scaffold.analytics` on is enough to see
 * events arrive, and swapping in a real store is `setAnalyticsSink` rather than
 * first-time wiring.
 *
 * One line per event, not per batch: a batch is an artefact of how the browser
 * chose to flush, and grouping by it would put unrelated events on one line.
 * At `info` because an event nobody can see is the state this exists to end.
 */
export const loggerAnalyticsSink: AnalyticsSink = async (
  services,
  events,
  identity
) => {
  for (const event of events) {
    services.logger.info({
      // Props first so a declared event can never clobber a reserved field:
      // an app that declares `name` or `userId` in its union would otherwise
      // rewrite the two fields the line is read by.
      ...event.props,
      analytics: event.name,
      userId: identity.userId,
      ...(event.at === undefined ? {} : { at: event.at }),
    })
  }
}
