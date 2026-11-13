import { AsyncLocalStorage } from 'node:async_hooks'
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks'
import {
  OtlpHttpExporter,
  OtlpLogger,
  OtlpTracer,
  asContextStorage,
  createRuntimeTelemetry,
  startProcessMetrics,
} from '@pikku/core/otlp'
import type { Tracer } from '@pikku/core/types'
import { noopLogger } from './bench-shared.js'

/**
 * L0 no telemetry (the harness baseline). L1 spans into an exporter that discards. L2 L1 plus one OtlpLogger record per request,
 * also discarded. L3 the real thing: `createRuntimeTelemetry` from env (protobuf encoding, HTTP POST to a loopback sink, process
 * metrics). The exporter has no gzip and the runtime has no sampler, so there is no L4 (see telemetry-cost.md).
 */
export const LEVELS = ['L0', 'L1', 'L2', 'L3'] as const
export type Level = (typeof LEVELS)[number]

export type StressOptions = {
  /** Extra attributes the tracer wrapper writes on every span: `count` keys of `valueLength` characters, under `keyPrefix`. */
  spanAttributes?: { count: number; valueLength: number; keyPrefix: string }
  /** `PIKKU_OTLP_LOG_FIELDS=1` and a log object with `fields` fields of `valueLength` characters, nested `depth` deep. */
  logFields?: { fields: number; valueLength: number; depth: number }
  /** A log message of this many characters (carrying a token-looking tail for the scrubber to chew on). */
  logMessageLength?: number
  /** Build the exporter by hand so its timeouts can be set (createRuntimeTelemetry takes none). */
  exporter?: {
    requestTimeoutMs?: number
    retryDelayMs?: number
    flushIntervalMs?: number
    maxBatch?: number
    backoffAfterFailures?: number
    backoffMs?: number
  }
}

export type Telemetry = {
  services: { logger: any; tracer?: Tracer }
  /** The real exporter at L3, undefined below. */
  exporter?: OtlpHttpExporter
  tracer?: OtlpTracer
  /** Spans and logs handed to a discarding exporter (L1/L2). */
  discarded: { spans: number; logs: number }
  stopMetrics(): void
  close(): Promise<void>
}

const discardingExporter = (discarded: Telemetry['discarded']) =>
  ({
    exportSpans: (spans: unknown[]) => {
      discarded.spans += spans.length
    },
    exportLogs: (records: unknown[]) => {
      discarded.logs += records.length
    },
    exportMetrics: () => {},
    flush: async () => {},
    close: async () => {},
    stats: { dropped: { spans: 0, logs: 0, metrics: 0 }, attributesDropped: 0 },
  }) as unknown as OtlpHttpExporter

const padded = (length: number, seed: string) =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length)

/** Wraps a tracer so every span it opens also gets `options.count` big attributes (keys `keyPrefix` + n). */
const withExtraAttributes = (
  tracer: Tracer,
  options: NonNullable<StressOptions['spanAttributes']>
): Tracer => {
  const value = padded(options.valueLength, 'abcdefghij')
  return Object.assign(Object.create(tracer), {
    startSpan(...args: Parameters<Tracer['startSpan']>) {
      const span = tracer.startSpan(...args)
      for (let i = 0; i < options.count; i++) {
        span.setAttribute(`${options.keyPrefix}${i}`, value)
      }
      return span
    },
  }) as Tracer
}

const nested = (
  depth: number,
  fields: number,
  valueLength: number
): unknown => {
  const value = padded(valueLength, 'lorem ipsum ')
  const out: Record<string, unknown> = {}
  for (let i = 0; i < fields; i++) {
    out[`field${i}`] =
      depth > 0 ? nested(depth - 1, Math.min(fields, 3), valueLength) : value
  }
  return out
}

/** A logger whose `info` writes one record shaped by `stress.logFields` / `logMessageLength`, for the payload stress runs. */
const shapedLogger = (inner: any, stress: StressOptions) => {
  const message = stress.logMessageLength
    ? `${padded(stress.logMessageLength, 'request handled ')} token=abcdef123456 Bearer abc.def.ghi`
    : undefined
  const fields = stress.logFields
    ? nested(
        stress.logFields.depth,
        stress.logFields.fields,
        stress.logFields.valueLength
      )
    : undefined
  if (!message && !fields) return inner
  return Object.create(inner, {
    info: {
      value: (text: string) =>
        fields
          ? inner.info({ message: message ?? text, ...(fields as object) })
          : inner.info(message),
    },
  })
}

export const buildTelemetry = (
  level: Level,
  sinkUrl: string | undefined,
  stress: StressOptions = {}
): Telemetry => {
  const discarded = { spans: 0, logs: 0 }
  const none: Telemetry = {
    services: { logger: noopLogger },
    discarded,
    stopMetrics() {},
    async close() {},
  }
  if (level === 'L0') {
    none.services.logger = shapedLogger(noopLogger, stress)
    return none
  }
  const storage = asContextStorage(new AsyncLocalStorage())
  let exporter: OtlpHttpExporter
  let tracer: OtlpTracer
  let logger: any
  let stopMetrics = () => {}
  let close = async () => {}
  if (level === 'L3') {
    if (!sinkUrl) throw new Error('L3 needs a sink URL')
    if (stress.exporter) {
      exporter = new OtlpHttpExporter({
        endpoint: sinkUrl,
        resource: { serviceName: 'telemetry-bench' },
        ...stress.exporter,
      })
      tracer = new OtlpTracer(exporter, { contextStorage: storage })
      logger = new OtlpLogger(noopLogger, exporter, {
        fields: stress.logFields !== undefined,
        currentContext: () => storage.get(),
        ...contextAttributes(tracer),
      })
      const metrics = startProcessMetrics(exporter)
      stopMetrics = () => metrics.stop()
      close = async () => {
        metrics.stop()
        await exporter.close()
      }
    } else {
      const runtime = createRuntimeTelemetry(
        {
          PIKKU_OTLP_ENDPOINT: sinkUrl,
          ...(stress.logFields ? { PIKKU_OTLP_LOG_FIELDS: '1' } : {}),
        },
        {
          logger: noopLogger,
          serviceName: 'telemetry-bench',
          contextStorage: storage,
        }
      )
      tracer = runtime.tracer as OtlpTracer
      exporter = (tracer as unknown as { exporter: OtlpHttpExporter }).exporter
      logger = runtime.logger
      stopMetrics = () => runtime.stopMetrics()
      close = () => runtime.close()
    }
  } else {
    exporter = discardingExporter(discarded)
    tracer = new OtlpTracer(exporter, { contextStorage: storage })
    logger =
      level === 'L2'
        ? new OtlpLogger(noopLogger, exporter, {
            currentContext: () => storage.get(),
            ...contextAttributes(tracer),
          })
        : noopLogger
  }
  const effective: Tracer = stress.spanAttributes
    ? withExtraAttributes(tracer, stress.spanAttributes)
    : tracer
  return {
    services: { logger: shapedLogger(logger, stress), tracer: effective },
    exporter: level === 'L3' ? exporter : undefined,
    tracer,
    discarded,
    stopMetrics,
    close,
  }
}

/** Wires the logger to the span's attributes when this core has `attributesOf` (#2412), exactly as createRuntimeTelemetry does. */
const contextAttributes = (tracer: OtlpTracer) => {
  const read = (tracer as unknown as { attributesOf?: (c: unknown) => unknown })
    .attributesOf
  return read
    ? { contextAttributes: (context: unknown) => read.call(tracer, context) }
    : {}
}

export type RuntimeProbe = {
  start(): void
  stop(): ProbeResult
}

export type ProbeResult = {
  cpuUserUs: number
  cpuSystemUs: number
  wallMs: number
  gcCount: number
  gcMajorCount: number
  gcPauseMs: number
  eventLoopLagMs: { p50: number; p99: number; max: number; mean: number }
}

/** CPU (process.cpuUsage: every thread), GC pauses (perf_hooks) and event-loop delay over a window. */
export const createProbe = (resolutionMs = 10): RuntimeProbe => {
  let cpu = process.cpuUsage()
  let wall = performance.now()
  let gcCount = 0
  let gcMajor = 0
  let gcPause = 0
  const histogram = monitorEventLoopDelay({ resolution: resolutionMs })
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gcCount++
      gcPause += entry.duration
      const kind = (entry as unknown as { detail?: { kind?: number } }).detail
        ?.kind
      if (kind === 4 || kind === 2) gcMajor++
    }
  })
  return {
    start() {
      gcCount = gcMajor = 0
      gcPause = 0
      histogram.reset()
      histogram.enable()
      observer.observe({ entryTypes: ['gc'] })
      cpu = process.cpuUsage()
      wall = performance.now()
    },
    stop() {
      const used = process.cpuUsage(cpu)
      const wallMs = performance.now() - wall
      observer.takeRecords()
      observer.disconnect()
      histogram.disable()
      const ms = (ns: number) =>
        Number.isFinite(ns) ? Math.max(0, ns / 1e6 - resolutionMs) : 0
      return {
        cpuUserUs: used.user,
        cpuSystemUs: used.system,
        wallMs,
        gcCount,
        gcMajorCount: gcMajor,
        gcPauseMs: gcPause,
        eventLoopLagMs: {
          p50: ms(histogram.percentile(50)),
          p99: ms(histogram.percentile(99)),
          max: ms(histogram.max),
          mean: ms(histogram.mean),
        },
      }
    },
  }
}

export const memorySnapshot = () => {
  globalThis.gc?.()
  const m = process.memoryUsage()
  return { rss: m.rss, heapUsed: m.heapUsed, external: m.external }
}

export const percentile = (sorted: ArrayLike<number>, p: number): number =>
  sorted.length === 0
    ? 0
    : (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0)

export const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = values.reduce((a, b) => a + b, 0) / (n || 1)
  const variance =
    n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0
  const median =
    n === 0
      ? 0
      : n % 2
        ? sorted[(n - 1) / 2]!
        : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
  return {
    n,
    median,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
  }
}
