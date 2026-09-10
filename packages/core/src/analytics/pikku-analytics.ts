import { setAnalyticsSink } from './analytics.js'
import type { AnalyticsSink } from './analytics.types.js'

export interface PikkuAnalytics<Events> {
  /**
   * What this app can measure: a schema whose discriminator is `name`. It
   * becomes the input schema of the generated `POST /analytics` ingest, so a
   * name it does not declare fails to compile at the call site and is rejected
   * at the wire.
   */
  events: Events
  /**
   * Where accepted events go. Registered when this module is evaluated, which
   * the generated ingest guarantees by importing it — so there is no ordering
   * to get right in `services.ts`, and no sink means a working endpoint that
   * drops what it accepts rather than a 500.
   */
  sink?: AnalyticsSink
}

/**
 * Declare this app's analytics.
 *
 * One declaration per project, found by inspection the way every other pikku
 * wiring is: there is no path to configure, and nothing to register by hand.
 * A platform that needs to send events somewhere else can still call
 * `setAnalyticsSink` afterwards — the last registration wins.
 */
export const pikkuAnalytics = <Events>(
  analytics: PikkuAnalytics<Events>
): PikkuAnalytics<Events> => {
  if (analytics.sink) {
    setAnalyticsSink(analytics.sink)
  }
  return analytics
}
