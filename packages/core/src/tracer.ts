import type { TraceContext } from './trace.js'

/** Attribute values OTLP can carry without a type conflict later. */
export type SpanAttributeValue = string | number | boolean

export type SpanKind =
  'internal' | 'server' | 'client' | 'producer' | 'consumer'

export interface SpanStatus {
  code: 'ok' | 'error' | 'unset'
  /** Error class + message, already redacted (no stack, at most 256 chars). */
  message?: string
}

/** A finished span, as the function runner (or a plugin) hands it to the sink. */
export interface FinishedSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  /** Unix epoch nanoseconds as bigint, never floats: stores want exact ns. */
  startTimeUnixNano: bigint
  endTimeUnixNano: bigint
  status: SpanStatus
  attributes: Record<string, SpanAttributeValue>
  /** Point-in-time events (e.g. `exception`), under the same attribute rules. */
  events?: ReadonlyArray<{
    name: string
    timeUnixNano: bigint
    attributes?: Record<string, SpanAttributeValue>
  }>
}

/** A span that is open; the runner ends it in `finally`. */
export interface Span {
  readonly context: TraceContext
  setAttribute(key: string, value: SpanAttributeValue): void
  /** Removes an attribute set earlier. Optional: a span that cannot remove one keeps it. */
  removeAttribute?(key: string): void
  addEvent(name: string, attributes?: Record<string, SpanAttributeValue>): void
  /**
   * Idempotent. `error` is the RAW thrown value: the runner does not redact it,
   * so an implementation MUST redact before recording (class and message only,
   * never a stack). `redactSpanError` and `RecordingTracer` are the reference.
   */
  end(status?: { code: 'ok' } | { code: 'error'; error: unknown }): void
}

/** The service a runtime injects as `singletonServices.tracer`. */
export interface Tracer {
  /**
   * Opens a span for `context`. Ids come from the wire, never from the tracer.
   * Must not throw; the runner wraps it anyway.
   */
  startSpan(
    name: string,
    context: TraceContext,
    options?: {
      kind?: SpanKind
      attributes?: Record<string, SpanAttributeValue>
      startTimeUnixNano?: bigint
    }
  ): Span
  /**
   * Optional. Runs `fn` with `span` as the current span of the async call tree
   * `fn` starts, so code that has no wire in hand (a database driver) can read
   * it back. The function runner calls it when present, around the middleware
   * chain and the function. Core imports no `AsyncLocalStorage`; a tracer that
   * implements this owns the storage. Must call `fn` exactly once and return
   * what it returns.
   */
  runInSpan?<T>(span: Span, fn: () => T): T
  /**
   * Optional. The context of the span whose work is running (the one
   * `runInSpan` made current), or `undefined` outside any span or when the
   * tracer has no storage. A service created at startup, with no wire in hand
   * (the scoped `http` service of an addon), parents its client span on this.
   * A tracer that wraps another one MUST forward it, or every span such a
   * service would open goes missing.
   */
  currentContext?(): TraceContext | undefined
  /** Flush what is buffered; called by `onServerStop` and `pikku serve` shutdown. */
  flush?(): Promise<void>
  close?(): Promise<void>
}

const INERT_SPAN_CONTEXT: TraceContext = {
  traceId: '00000000000000000000000000000000',
  spanId: '0000000000000000',
  sampled: false,
}

const NOOP_SPAN: Span = {
  context: INERT_SPAN_CONTEXT,
  setAttribute() {},
  removeAttribute() {},
  addEvent() {},
  end() {},
}

/** The tracer used when none is injected: `startSpan` returns one shared inert span. */
export const NOOP_TRACER: Tracer = {
  startSpan: () => NOOP_SPAN,
}

/** What a `Span` implementation enforces, so every tracer agrees. */
export const SPAN_LIMITS = {
  attributes: 64,
  keyLength: 128,
  stringLength: 1024,
  events: 32,
  statusMessageLength: 256,
} as const

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

/**
 * Sets `key` on `attributes` within {@link SPAN_LIMITS}. Returns false when it
 * was dropped (too many attributes, or a key that is too long) so the caller
 * can count it. Strings are truncated rather than dropped.
 */
export const setBoundedAttribute = (
  attributes: Record<string, SpanAttributeValue>,
  key: string,
  value: SpanAttributeValue
): boolean => {
  if (key.length > SPAN_LIMITS.keyLength) return false
  if (
    !Object.prototype.hasOwnProperty.call(attributes, key) &&
    Object.keys(attributes).length >= SPAN_LIMITS.attributes
  ) {
    return false
  }
  attributes[key] =
    typeof value === 'string'
      ? truncate(value, SPAN_LIMITS.stringLength)
      : value
  return true
}

/**
 * The only form in which an error leaves the runtime on a span: class name and
 * message, never a stack (stacks carry file paths and sometimes interpolated
 * input).
 */
export const redactSpanError = (
  error: unknown
): { type: string; text: string; message: string } => {
  const read = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }
  const type = truncate(
    read(
      () =>
        error instanceof Error
          ? error.name || 'Error'
          : error === null
            ? 'null'
            : typeof error,
      'Error'
    ),
    SPAN_LIMITS.keyLength
  )
  const text = truncate(
    read(
      () => (error instanceof Error ? error.message : String(error)),
      '[unprintable error]'
    ),
    SPAN_LIMITS.statusMessageLength
  )
  return {
    type,
    /** The bare message, truncated: what `exception.message` carries. */
    text,
    /** `Type: message` (or bare type when empty), truncated: what `status.message` carries. */
    message: truncate(
      text ? `${type}: ${text}` : type,
      SPAN_LIMITS.statusMessageLength
    ),
  }
}

/** Unix epoch nanoseconds now, as the exact bigint a store wants. */
export const nowUnixNano = (): bigint =>
  BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e3)) * 1000n
