import type { FinishedSpan, SpanAttributeValue, SpanKind } from '../tracer.js'
import type {
  OtlpLogRecord,
  OtlpMetricPoint,
  OtlpResource,
} from './otlp-types.js'

/** A span that has started and not yet ended, as an in-process sink sees it. */
export interface OpenSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTimeUnixNano: bigint
  /** A copy: what the span carried when it started. */
  attributes: Record<string, SpanAttributeValue>
}

/**
 * What every OTLP sink does, whatever it maps. The HTTP exporter is one; so is
 * a sink an app registers in `createSingletonServices`. Nothing here may throw
 * into the caller: the fan-out catches, but a sink that never throws is the
 * contract.
 */
export interface OtlpSinkBase {
  /** Called once when the sink is registered, with what the runtime knows about this process. */
  setResource?(resource: OtlpResource): void
  /** A sampled span has started. Optional: a sink that only wants finished spans omits it. */
  onSpanStart?(span: OpenSpan): void
  exportSpans(spans: FinishedSpan[]): void
  exportLogs(records: OtlpLogRecord[]): void
  exportMetrics(points: OtlpMetricPoint[]): void
  /**
   * False when nothing is listening, so the tracer opens no span at all. Absent means listening. Only the
   * fan-out over the registry sets it.
   */
  readonly active?: boolean
  /** Sends what is buffered. Never rejects. */
  flush(): Promise<void>
  /** Flushes and refuses further records. Never rejects. */
  close(): Promise<void>
}

/**
 * A sink with a map of type `TMap`, applied once at registration. With the
 * default `void` the sink has no map and no `setMap`.
 *
 * `setMap` is a property, not a method: a method's parameter is checked
 * bivariantly, which would let a sink that wants a `CityMap` be registered with
 * any other map.
 */
export type OtlpSink<TMap = void> = [TMap] extends [void]
  ? OtlpSinkBase & { readonly setMap?: undefined }
  : OtlpSinkBase & { readonly setMap: (map: TMap) => void }

const CLOSE_CAP_MS = 2000

/**
 * The OTLP sinks of this process. Core creates one before the app's
 * `createSingletonServices` runs and hands it in as `otlpSinks`; the app
 * registers sinks in plain code. The tracer, logger and metrics sampler read the
 * list when they export, so a sink added after they were built still receives
 * what happens from then on.
 *
 * @example snippet: registerOtlpSink
 */
export class OtlpSinkRegistry {
  private readonly sinks: OtlpSinkBase[] = []
  private resource: OtlpResource | undefined

  /** Registers a sink that has no map. */
  add(sink: OtlpSink): void
  /**
   * Registers a sink and gives it its map. `TMap` is inferred from the sink,
   * never from the map argument, so a map of the wrong shape is refused.
   */
  add<TMap>(sink: OtlpSink<TMap>, map: NoInfer<TMap>): void
  add(sink: OtlpSinkBase & { setMap?: (map: never) => void }, map?: unknown) {
    sink.setMap?.(map as never)
    if (this.resource) sink.setResource?.(this.resource)
    this.sinks.push(sink)
  }

  /** Tells the registry, and every sink registered now or later, what this process is. */
  setResource(resource: OtlpResource): void {
    this.resource = resource
    for (const sink of this.sinks) sink.setResource?.(resource)
  }

  /** The sinks registered so far; read at export time, never cached. */
  list(): readonly OtlpSinkBase[] {
    return this.sinks
  }
}

/**
 * A new, empty registry, for a runtime that does not go through `pikku dev`, `serve` or a standalone build.
 *
 * @example snippet: registerOtlpSink
 */
export const createOtlpSinks = (): OtlpSinkRegistry => new OtlpSinkRegistry()

const safely = (fn: () => void): void => {
  try {
    fn()
  } catch {
    // Telemetry never fails a request, and one sink never costs another its data.
  }
}

/** The sink the tracer, logger and metrics sampler write to: every registered sink, read at call time. */
export interface OtlpFanOut extends OtlpSinkBase {
  /** False while the registry is empty. */
  readonly active: boolean
}

/**
 * One {@link OtlpSinkBase} over the registry. A plain loop: each sink is called
 * inside its own `try`, keeps its own queue, and cannot throw into another. A
 * sink's `flush` and `close` run side by side, share one two-second cap, and a
 * rejection or a sink that never settles is given up on.
 *
 * @example snippet: registerOtlpSink
 */
export const fanOutOtlp = (registry: OtlpSinkRegistry): OtlpFanOut => {
  const settleAll = async (
    run: (sink: OtlpSinkBase) => Promise<void>
  ): Promise<void> => {
    const sinks = [...registry.list()]
    if (sinks.length === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CLOSE_CAP_MS)
      ;(timer as { unref?: () => void }).unref?.()
    })
    try {
      await Promise.race([
        Promise.allSettled(
          sinks.map((sink) => Promise.resolve().then(() => run(sink)))
        ),
        cap,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get active() {
      return registry.list().length > 0
    },
    onSpanStart: (span) => {
      for (const sink of registry.list()) {
        if (sink.onSpanStart) safely(() => sink.onSpanStart!(span))
      }
    },
    exportSpans: (spans) => {
      for (const sink of registry.list()) safely(() => sink.exportSpans(spans))
    },
    exportLogs: (records) => {
      for (const sink of registry.list()) safely(() => sink.exportLogs(records))
    },
    exportMetrics: (points) => {
      for (const sink of registry.list()) {
        safely(() => sink.exportMetrics(points))
      }
    },
    flush: () => settleAll((sink) => sink.flush()),
    close: () => settleAll((sink) => sink.close()),
  }
}
