import {
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
import type { TraceContext } from '../trace.js'
import type { ContextStorage } from '../otlp/otlp-tracer.js'

/**
 * A `Tracer` that keeps every finished span in memory, under the same limits
 * and redaction a real tracer applies. For tests and verifiers that assert one
 * span per hop. Given a `contextStorage`, `runInSpan` and `currentContext`
 * behave as `OtlpTracer`'s do.
 */
export class RecordingTracer implements Tracer {
  readonly spans: FinishedSpan[] = []
  readonly stats = { dropped: 0, started: 0 }

  constructor(
    private readonly options: { contextStorage?: ContextStorage } = {}
  ) {}

  /** Runs `fn` with `span` as the current context, when a context storage was given. */
  runInSpan<T>(span: Span, fn: () => T): T {
    const storage = this.options.contextStorage
    return storage ? storage.run(span.context, fn) : fn()
  }

  /** The context of the span whose work is running, if a context storage was given. */
  currentContext(): TraceContext | undefined {
    return this.options.contextStorage?.get()
  }

  startSpan(
    name: string,
    context: TraceContext,
    options: {
      kind?: SpanKind
      attributes?: Record<string, SpanAttributeValue>
      startTimeUnixNano?: bigint
    } = {}
  ): Span {
    this.stats.started++
    const attributes: Record<string, SpanAttributeValue> = {}
    const events: NonNullable<FinishedSpan['events']> extends ReadonlyArray<
      infer E
    >
      ? E[]
      : never = []
    const startTimeUnixNano = options.startTimeUnixNano ?? nowUnixNano()
    const set = (key: string, value: SpanAttributeValue) => {
      if (!setBoundedAttribute(attributes, key, value)) this.stats.dropped++
    }
    for (const [key, value] of Object.entries(options.attributes ?? {})) {
      set(key, value)
    }
    let ended = false
    return {
      context,
      setAttribute: (key, value) => {
        if (!ended) set(key, value)
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
          if (!setBoundedAttribute(bounded, key, value)) this.stats.dropped++
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
        this.spans.push({
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
        })
      },
    }
  }
}
