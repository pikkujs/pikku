import type {
  AnalyticsEventSink,
  AnalyticsSinkRegistry,
} from '@pikku/core/analytics'
import type { OtlpSinkBase, OtlpSinkRegistry } from '@pikku/core/otlp'
import { createRunStitcher } from '@pikku/core/otlp/runs'

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

/** Called from `createSingletonServices` with the registry the host hands in as `existingServices.otlpSinks`. */
export const registerRunStitcher = (otlpSinks: OtlpSinkRegistry) => {
  // @snippet start stitchRuns
  const stitcher = createRunStitcher({
    resource: { serviceName: 'online-shop' },
  })
  stitcher.subscribe((event) => {
    if (event.type === 'run.finished' || event.type === 'run.failed') {
      console.debug(event.seq, event.type, event.traceId, event.durationMs)
    }
  })
  otlpSinks.add({
    onSpanStart: (span) =>
      stitcher.start(span, Number(span.startTimeUnixNano / 1_000_000n)),
    exportSpans: (spans) => {
      for (const span of spans) {
        stitcher.end(span, Number(span.endTimeUnixNano / 1_000_000n))
      }
    },
    exportLogs() {},
    exportMetrics() {},
    flush: async () => {},
    close: async () => {},
  })
  // The caller owns the clock: settle, expire and refresh health on a timer.
  setInterval(() => stitcher.sweep(Date.now()), 1_000).unref()
  // A client fetches this, then applies the events whose seq is greater.
  const current = stitcher.snapshot(Date.now())
  // @snippet end stitchRuns
  return current
}
