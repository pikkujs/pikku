import { LogLevel, type Logger } from '../services/logger.js'
import type { TraceContext } from '../trace.js'
import { SPAN_LIMITS } from '../tracer.js'
import type { SpanAttributeValue } from '../tracer.js'
import type { OtlpHttpExporter } from './otlp-http-exporter.js'
import type { OtlpSeverity } from './otlp-types.js'

export interface OtlpLoggerOptions {
  /** The lowest level forwarded as an OTLP log. Default `info`. */
  minLevel?: LogLevel
  /** The trace and span a record belongs to, read per call. */
  currentContext?: () => TraceContext | undefined
  /** A trace id every record carries (what `scope` sets). */
  traceId?: string
}

const SEVERITY: Record<LogLevel, OtlpSeverity> = {
  [LogLevel.trace]: 'trace',
  [LogLevel.debug]: 'debug',
  [LogLevel.info]: 'info',
  [LogLevel.warn]: 'warn',
  [LogLevel.error]: 'error',
  [LogLevel.critical]: 'critical',
}

const BODY_LENGTH = 4096

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const stringify = (value: unknown): string => {
  try {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  } catch {
    return String(value)
  }
}

/** A scalar stays one; anything nested is JSON text, bounded. */
const asAttribute = (value: unknown): SpanAttributeValue | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : String(value)
  return clip(stringify(value), SPAN_LIMITS.stringLength)
}

/**
 * A log call as an OTLP record: the message is the body; an object's top-level
 * fields are attributes. An `Error` contributes its class and message and never
 * its stack.
 */
const toRecord = (
  messageOrObj: unknown,
  meta: unknown[]
): { body: string; attributes: Record<string, SpanAttributeValue> } => {
  const attributes: Record<string, SpanAttributeValue> = {}
  const add = (key: string, value: unknown) => {
    const attribute = asAttribute(value)
    if (
      attribute !== undefined &&
      key.length <= SPAN_LIMITS.keyLength &&
      Object.keys(attributes).length < SPAN_LIMITS.attributes
    ) {
      attributes[key] = attribute
    }
  }
  const absorb = (value: unknown): string => {
    if (value instanceof Error) {
      add('exception.type', value.name || 'Error')
      return value.message
    }
    if (value && typeof value === 'object') {
      const { message, ...rest } = value as Record<string, unknown>
      for (const [key, field] of Object.entries(rest)) add(key, field)
      return typeof message === 'string' ? message : ''
    }
    return typeof value === 'string' ? value : stringify(value)
  }
  const head = absorb(messageOrObj)
  const tail = meta.map(absorb).filter((part) => part.length > 0)
  return {
    body: clip([head, ...tail].filter(Boolean).join(' '), BODY_LENGTH),
    attributes,
  }
}

/**
 * A `Logger` that writes through `inner` unchanged and also forwards each record
 * at or above `minLevel` to an {@link OtlpHttpExporter}. Forwarding is
 * enqueue-only and cannot throw into the caller.
 */
export class OtlpLogger implements Logger {
  private readonly minLevel: LogLevel

  constructor(
    private readonly inner: Logger,
    private readonly exporter: OtlpHttpExporter,
    private readonly options: OtlpLoggerOptions = {}
  ) {
    this.minLevel = options.minLevel ?? LogLevel.info
  }

  private forward(level: LogLevel, messageOrObj: unknown, meta: unknown[]) {
    if (level < this.minLevel) return
    try {
      const context = this.options.currentContext?.()
      const traceId = this.options.traceId ?? context?.traceId
      const { body, attributes } = toRecord(messageOrObj, meta)
      this.exporter.exportLogs([
        {
          severity: SEVERITY[level],
          body,
          attributes,
          ...(traceId ? { traceId } : {}),
          ...(traceId && context?.traceId === traceId
            ? { spanId: context.spanId }
            : {}),
        },
      ])
    } catch {
      // Telemetry never breaks a request.
    }
  }

  // The `Safe<>` guards on `Logger` are compile-time only; the wrapper passes
  // the arguments through untouched.
  info(messageOrObj: unknown, ...meta: unknown[]) {
    Reflect.apply(this.inner.info, this.inner, [messageOrObj, ...meta])
    this.forward(LogLevel.info, messageOrObj, meta)
  }

  warn(messageOrObj: unknown, ...meta: unknown[]) {
    Reflect.apply(this.inner.warn, this.inner, [messageOrObj, ...meta])
    this.forward(LogLevel.warn, messageOrObj, meta)
  }

  error(messageOrObj: unknown, ...meta: unknown[]) {
    Reflect.apply(this.inner.error, this.inner, [messageOrObj, ...meta])
    this.forward(LogLevel.error, messageOrObj, meta)
  }

  debug(message: string, ...meta: unknown[]) {
    Reflect.apply(this.inner.debug, this.inner, [message, ...meta])
    this.forward(LogLevel.debug, message, meta)
  }

  trace(message: string, ...meta: unknown[]) {
    if (this.inner.trace) {
      Reflect.apply(this.inner.trace, this.inner, [message, ...meta])
    }
    this.forward(LogLevel.trace, message, meta)
  }

  setLevel(level: LogLevel) {
    this.inner.setLevel(level)
  }

  scope(traceId: string): Logger {
    return new OtlpLogger(
      this.inner.scope?.(traceId) ?? this.inner,
      this.exporter,
      {
        ...this.options,
        traceId,
      }
    )
  }
}
