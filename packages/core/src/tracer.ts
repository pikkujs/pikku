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
  addEvent(name: string, attributes?: Record<string, SpanAttributeValue>): void
  /** Idempotent. `error` is redacted here, never by the caller. */
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
): { type: string; message: string } => {
  const type =
    error instanceof Error
      ? error.name || 'Error'
      : error === null
        ? 'null'
        : typeof error
  const text = error instanceof Error ? error.message : String(error)
  return {
    type,
    message: truncate(`${type}: ${text}`, SPAN_LIMITS.statusMessageLength),
  }
}

/** Unix epoch nanoseconds now, as the exact bigint a store wants. */
export const nowUnixNano = (): bigint =>
  BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e3)) * 1000n
