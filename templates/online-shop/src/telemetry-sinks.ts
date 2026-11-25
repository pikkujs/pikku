import type { OtlpSinkBase, OtlpSinkRegistry } from '@pikku/core/otlp'
import { createRunStitcher } from '@pikku/core/otlp/runs'

/** Called from `createSingletonServices` with the registry the host hands in as `existingServices.otlpSinks`. */
export const registerTelemetrySinks = (otlpSinks: OtlpSinkRegistry) => {
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
  // One clock for everything: unix milliseconds from the wall clock. Span times, `start`/`end`, `sweep` and `snapshot`
  // are compared with each other (the health window, settle, ttl), so they must share it.
  const now = () => Date.now()
  otlpSinks.add({
    onSpanStart: (span) => stitcher.start(span, now()),
    exportSpans: (spans) => {
      for (const span of spans) stitcher.end(span, now())
    },
    exportLogs() {},
    exportMetrics() {},
    flush: async () => {},
    close: async () => {},
  })
  // Settle, expire and refresh health on a timer.
  setInterval(() => stitcher.sweep(now()), 1_000).unref()
  // A client fetches this, then applies the events whose seq is greater.
  const current = stitcher.snapshot(now())
  // @snippet end stitchRuns
  return current
}
