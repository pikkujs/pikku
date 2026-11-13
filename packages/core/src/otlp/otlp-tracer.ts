import type { TraceContext } from '../trace.js'
import {
  NOOP_TRACER,
  nowUnixNano,
  redactSpanError,
  setBoundedAttribute,
  SPAN_LIMITS,
  type FinishedSpan,
  type Span,
  type SpanAttributeValue,
  type SpanKind,
  type Tracer,
} from '../tracer.js'
import type { OtlpHttpExporter } from './otlp-http-exporter.js'

/**
 * Where the current trace context lives while a span's work runs. Core does not
 * import `node:async_hooks`: a runtime that has `AsyncLocalStorage` hands one in
 * through this shape, and an edge runtime hands in nothing.
 */
export interface ContextStorage {
  run<T>(context: TraceContext, fn: () => T): T
  get(): TraceContext | undefined
}

export interface OtlpTracerOptions {
  contextStorage?: ContextStorage
}

type SpanEvent = NonNullable<FinishedSpan['events']>[number]

/**
 * A `Tracer` that hands every ended span to an {@link OtlpHttpExporter}. Ids
 * come from the wire; this class only records when a span started, ended and how.
 * An unsampled trace opens the shared inert span and exports nothing.
 */
export class OtlpTracer implements Tracer {
  /** Spans started, and attributes or events dropped by the span limits. */
  readonly stats = { started: 0, dropped: 0 }

  /** The attributes of the span of each context, for as long as the context lives: what a log line written inside the span inherits. */
  private readonly attributesByContext = new WeakMap<
    TraceContext,
    Record<string, SpanAttributeValue>
  >()

  constructor(
    private readonly exporter: OtlpHttpExporter,
    private readonly options: OtlpTracerOptions = {}
  ) {}

  startSpan(
    name: string,
    context: TraceContext,
    options: {
      kind?: SpanKind
      attributes?: Record<string, SpanAttributeValue>
      startTimeUnixNano?: bigint
    } = {}
  ): Span {
    if (!context.sampled) return NOOP_TRACER.startSpan(name, context)
    this.stats.started++
    const attributes: Record<string, SpanAttributeValue> = {}
    const events: SpanEvent[] = []
    const startTimeUnixNano = options.startTimeUnixNano ?? nowUnixNano()
    const set = (
      target: Record<string, SpanAttributeValue>,
      key: string,
      value: SpanAttributeValue
    ) => {
      if (!setBoundedAttribute(target, key, value)) this.stats.dropped++
    }
    for (const [key, value] of Object.entries(options.attributes ?? {})) {
      set(attributes, key, value)
    }
    this.attributesByContext.set(context, attributes)
    let ended = false
    return {
      context,
      setAttribute: (key, value) => {
        if (!ended) set(attributes, key, value)
      },
      removeAttribute: (key) => {
        if (!ended) delete attributes[key]
      },
      addEvent: (eventName, eventAttributes) => {
        if (ended) return
        if (events.length >= SPAN_LIMITS.events) {
          this.stats.dropped++
          return
        }
        const bounded: Record<string, SpanAttributeValue> = {}
        for (const [key, value] of Object.entries(eventAttributes ?? {})) {
          set(bounded, key, value)
        }
        events.push({
          name: eventName,
          timeUnixNano: nowUnixNano(),
          attributes: bounded,
        })
      },
      end: (status) => {
        if (ended) return
        ended = true
        this.exporter.exportSpans([
          {
            traceId: context.traceId,
            spanId: context.spanId,
            ...(context.parentSpanId
              ? { parentSpanId: context.parentSpanId }
              : {}),
            name,
            kind: options.kind ?? 'internal',
            startTimeUnixNano,
            endTimeUnixNano: nowUnixNano(),
            status:
              status?.code === 'error'
                ? {
                    code: 'error',
                    message: redactSpanError(status.error).message,
                  }
                : { code: status?.code ?? 'unset' },
            attributes,
            ...(events.length > 0 ? { events } : {}),
          },
        ])
      },
    }
  }

  /** Runs `fn` with `span` as the current context, when a context storage was given. */
  runInSpan<T>(span: Span, fn: () => T): T {
    const storage = this.options.contextStorage
    return storage ? storage.run(span.context, fn) : fn()
  }

  /** The context of the span whose work is running, if a context storage was given. */
  currentContext(): TraceContext | undefined {
    return this.options.contextStorage?.get()
  }

  /** What the span of `context` has recorded so far (live: it grows as the span does). */
  attributesOf(
    context: TraceContext
  ): Readonly<Record<string, SpanAttributeValue>> | undefined {
    return this.attributesByContext.get(context)
  }

  flush(): Promise<void> {
    return this.exporter.flush()
  }

  close(): Promise<void> {
    return this.exporter.close()
  }
}
