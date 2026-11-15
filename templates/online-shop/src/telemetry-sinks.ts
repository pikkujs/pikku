import type {
  AnalyticsEventSink,
  AnalyticsSinkRegistry,
} from '@pikku/core/analytics'
import type { OtlpSinkBase, OtlpSinkRegistry } from '@pikku/core/otlp'

/**
 * Called from `createSingletonServices` with the registries the host hands in
 * as `existingServices.otlpSinks` and `existingServices.analyticsSinks`.
 */
export const registerTelemetrySinks = (
  otlpSinks: OtlpSinkRegistry,
  analyticsSinks: AnalyticsSinkRegistry
) => {
  // @snippet start registerOtlpSink
  const spanLog: OtlpSinkBase = {
    onSpanStart: (span) => console.debug('started', span.name),
    exportSpans: (spans) => console.debug('ended', spans.length),
    exportLogs() {},
    exportMetrics() {},
    flush: async () => {},
    close: async () => {},
  }
  otlpSinks.add(spanLog)
  // @snippet end registerOtlpSink

  // @snippet start registerAnalyticsSink
  const conversions: AnalyticsEventSink = {
    write: async (events) => console.debug('conversions', events.length),
  }
  // Only the events named in the map reach this sink; any other is dropped.
  analyticsSinks.add(conversions, { checkout_completed: true })
  // @snippet end registerAnalyticsSink
}
