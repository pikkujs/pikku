import type { CoreSingletonServices } from '../types/core.types.js'
import type {
  AnalyticsEventInput,
  AnalyticsIdentity,
  AnalyticsSink,
} from './analytics.types.js'

let sink: AnalyticsSink | undefined

/**
 * Register where accepted events go. Called once at boot by whatever provides
 * the analytics backend; calling it again replaces the sink.
 */
export const setAnalyticsSink = (next: AnalyticsSink | undefined): void => {
  sink = next
}

/** The registered sink, or undefined when nothing is collecting. */
export const getAnalyticsSink = (): AnalyticsSink | undefined => sink

/**
 * Split a registry event into the shape a sink stores.
 *
 * The app's registry declares events as a discriminated union on `name`, so
 * every event is `{ name, ...props }`. Removing the discriminator here — rather
 * than in each sink — keeps `props` free of a field that is already the series
 * key, which would otherwise be stored twice and diverge under renames.
 */
export const flattenAnalyticsEvent = (
  event: { name: string } & Record<string, unknown>,
  at?: number
): AnalyticsEventInput => {
  const { name, ...props } = event
  return { name, props, ...(at === undefined ? {} : { at }) }
}

/**
 * Hand a validated batch to the registered sink.
 *
 * Returns how many events were accepted, which is the whole batch: acceptance
 * means "validated and handed on", not "durably stored". The browser cannot act
 * on a storage failure — it has already navigated away — so reporting delivery
 * would be a promise the response cannot keep.
 *
 * With no sink registered this is a no-op that still reports the batch
 * accepted, for the same reason: the caller has nothing useful to do about it.
 */
export const recordAnalyticsEvents = async (
  services: CoreSingletonServices,
  events: AnalyticsEventInput[],
  identity: AnalyticsIdentity
): Promise<number> => {
  if (events.length === 0) return 0
  if (sink) {
    await sink(services, events, identity)
  }
  return events.length
}
