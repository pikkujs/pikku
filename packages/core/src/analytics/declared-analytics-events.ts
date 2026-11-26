import { pikkuState } from '../pikku-state.js'
import type { AnalyticsSinkRegistry } from './fan-out-analytics.js'

/**
 * The names of the events the app declares with `defineAnalyticsEvents`, as
 * the generated bootstrap registered them. Read from runtime state, so it works
 * in a bundle with no filesystem and no `metaService`.
 *
 * Throws when the bootstrap never registered them: a sink built from an empty
 * list would receive nothing, and nothing would say why.
 *
 * @example snippet: declaredAnalyticsEvents
 */
export const getDeclaredAnalyticsEvents = (): string[] => {
  const meta = pikkuState(null, 'analytics', 'meta')
  if (!meta) {
    throw new Error(
      'No analytics events are registered: the bootstrap did not import analytics/pikku-analytics-meta.gen.ts. Run `pikku all` and import the generated bootstrap before reading them.'
    )
  }
  return Object.keys(meta)
}

/**
 * Refuses a runtime that registered analytics sinks while declaring no events,
 * which would drop every event without a word. A registry with no sinks passes.
 *
 * @example snippet: declaredAnalyticsEvents
 */
export const assertAnalyticsSinksDeclared = (
  registry: AnalyticsSinkRegistry | undefined
): void => {
  const sinks = registry?.entries().length ?? 0
  if (sinks === 0) return
  if (getDeclaredAnalyticsEvents().length === 0) {
    throw new Error(
      `${sinks} analytics sink${sinks === 1 ? ' is' : 's are'} registered, but the app declares no analytics events, so every event would be dropped. Declare them with defineAnalyticsEvents and run \`pikku all\`, or register no sink.`
    )
  }
}
