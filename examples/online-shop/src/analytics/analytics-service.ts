import type { AnalyticsRecord, AnalyticsService } from '#pikku/analytics'
import type { SingletonServices } from '#pikku/function'
import { forwardAnalyticsEvents } from '../__fabric_analytics__/fabric-analytics.js'

/**
 * The fabric destination, as an `AnalyticsService` the generated ingest can be
 * given.
 *
 * Before analytics moved into core this app owned the whole ingest and called
 * the forwarder from inside it. The ingest is generated now, so the forwarder
 * becomes a sink instead — which is also what lets it sit beside a second
 * destination without either one knowing.
 *
 * One call per record rather than one per batch, because `forwardAnalyticsEvents`
 * takes a single identity for everything it is handed and a batch spans
 * invocations: one signed-in visitor's events would be attributed to whoever
 * happened to be first in the array.
 */
export const fabricAnalyticsService = (
  services: Pick<SingletonServices, 'variables' | 'queueService'>
): AnalyticsService => ({
  async write(batch: AnalyticsRecord[]): Promise<void> {
    for (const { name, props, at, userIdentity } of batch) {
      await forwardAnalyticsEvents(
        services,
        [{ name, props, ...(at === undefined ? {} : { at }) }],
        userIdentity
      )
    }
  },
})
