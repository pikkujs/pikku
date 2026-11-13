import { LogLevel, type Logger } from '../services/logger.js'
import type { TraceContext } from '../trace.js'
import { nowUnixNano, SPAN_LIMITS } from '../tracer.js'
import type { SpanAttributeValue } from '../tracer.js'
import type { OtlpHttpExporter } from './otlp-http-exporter.js'
import type { OtlpSeverity } from './otlp-types.js'

export interface OtlpLoggerOptions {
  /** The lowest level forwarded as an OTLP log. Default `info`. */
  minLevel?: LogLevel
  /** The trace and span a record belongs to, read per call. */
  currentContext?: () => TraceContext | undefined
  /** Export an object's fields as log attributes (`PIKKU_OTLP_LOG_FIELDS=1`). Default off: only the message leaves. */
  fields?: boolean
  /**
   * The attributes of the span `context` belongs to. A record written inside a function's span carries that span's
   * {@link CONTEXT_ATTRIBUTES} (the function, its version, the wire, and the user and organisation when the span has them), so the
   * read side can group and filter log lines the way it does spans, without `fields` being on.
   */
  contextAttributes?: (
    context: TraceContext
  ) => Readonly<Record<string, SpanAttributeValue>> | undefined
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

/** The span attributes a log record inherits from the span it is written in: the span's own names, so one column serves both. */
export const CONTEXT_ATTRIBUTES = [
  'pikku.function.id',
  'pikku.function.version',
  'pikku.wire.type',
  'pikku.wire.id',
  'pikku.user.id',
  'pikku.org.id',
  'pikku.impersonated',
  'pikku.impersonator.id',
] as const

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const stringify = (value: unknown): string => {
  try {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  } catch {
    return String(value)
  }
}

const SENSITIVE_KEY =
  /token|secret|password|passwd|pwd|pass|auth|cookie|key|credential|session|bearer|jwt|otp|pin|ssn|sig|salt|dsn|csrf|xsrf|sid|cvv|card|oauth|url|headers|connection|database_url/i

export const REDACTED_ATTRIBUTE = '[redacted]'

const MAX_DEPTH = 4

/**
 * Copies `value` for export as field text: a field whose name looks sensitive
 * becomes `[redacted]`, plain-string array elements and numeric keys are left
 * out. Fails closed: a match on the name alone is enough, whatever the value is.
 */
const sanitize = (value: unknown, depth = 0): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return REDACTED_ATTRIBUTE
  try {
    if (Array.isArray(value)) {
      return value
        .filter((item) => typeof item !== 'string')
        .map((item) => sanitize(item, depth + 1))
    }
    const source =
      typeof (value as { toJSON?: unknown }).toJSON === 'function'
        ? (value as { toJSON: () => unknown }).toJSON()
        : value
    if (source === null || typeof source !== 'object') return source
    const out: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(source)) {
      if (/^\d+$/.test(key)) continue
      out[key] = SENSITIVE_KEY.test(key)
        ? REDACTED_ATTRIBUTE
        : sanitize(field, depth + 1)
    }
    return out
  } catch {
    return REDACTED_ATTRIBUTE
  }
}

const VALUE_PATTERNS: [RegExp, string][] = [
  [
    /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@]+@/gi,
    `$1${REDACTED_ATTRIBUTE}@`,
  ],
  [/\bBearer\s+[^\s,;"']+/gi, REDACTED_ATTRIBUTE],
  [
    /\b(?:Authorization|Cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n]*)/gi,
    REDACTED_ATTRIBUTE,
  ],
  [
    /(token|key|secret|password|passwd|pwd|signature|sig|code)(["']?\s*=\s*["']?|["']\s*:\s*["']?)[^\s&"',;]+/gi,
    `$1$2${REDACTED_ATTRIBUTE}`,
  ],
  [
    /\b(password|passwd|pwd)(\s*:\s*)[^\s,;"'}]+/gi,
    `$1$2${REDACTED_ATTRIBUTE}`,
  ],
]

/** Text longer than this is cut before scrubbing, so a hostile or huge value cannot stall the event loop. */
export const SCRUB_INPUT_LIMIT = 8192

/**
 * Best-effort scrub of secrets that look like secrets inside free text: URL
 * userinfo, bearer tokens, `Authorization` and `Cookie` headers and
 * `token=...` style pairs. The input is clipped to {@link SCRUB_INPUT_LIMIT}
 * first and every pattern is anchored on a literal, so the cost is linear.
 */
export const scrubText = (text: string): string =>
  VALUE_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    clip(text, SCRUB_INPUT_LIMIT)
  )

/** A scalar stays one; anything nested is JSON text, bounded. Strings are scrubbed. */
const asAttribute = (value: unknown): SpanAttributeValue | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : String(value)
  return clip(scrubText(stringify(value)), SPAN_LIMITS.stringLength)
}

/**
 * A log call as an OTLP record: the scrubbed message is the body. An object's
 * fields become attributes only when `fields` is on, and then sensitive-looking
 * names are redacted. An `Error` contributes its message and never its stack.
 */
const toRecord = (
  messageOrObj: unknown,
  meta: unknown[],
  fields: boolean
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
      if (fields) add('exception.type', value.name || 'Error')
      return value.message
    }
    if (value && typeof value === 'object') {
      const { message, ...rest } = value as Record<string, unknown>
      if (fields) {
        for (const [key, field] of Object.entries(rest)) {
          if (/^\d+$/.test(key)) continue
          add(
            key,
            SENSITIVE_KEY.test(key) ? REDACTED_ATTRIBUTE : sanitize(field)
          )
        }
      }
      return typeof message === 'string' ? message : ''
    }
    return typeof value === 'string' ? value : stringify(value)
  }
  const head = absorb(messageOrObj)
  const tail = meta.map(absorb).filter((part) => part.length > 0)
  return {
    body: clip(
      scrubText([head, ...tail].filter(Boolean).join(' ')),
      BODY_LENGTH
    ),
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
    // Stamped here: left unset, the encoder would use the flush time and every
    // record in one batch would share it.
    const timeUnixNano = nowUnixNano()
    try {
      const context = this.options.currentContext?.()
      const traceId = this.options.traceId ?? context?.traceId
      const { body, attributes } = toRecord(
        messageOrObj,
        meta,
        this.options.fields === true
      )
      // A field of the record never sets what the span's context owns: with
      // `fields` on, app code could otherwise forge an identity. The span's value
      // wins, and with none the attribute stays absent.
      for (const key of CONTEXT_ATTRIBUTES) delete attributes[key]
      // Only when the record is of the span's own trace: a `scope(traceId)` for another trace is not inside this span.
      const span =
        context && (!this.options.traceId || context.traceId === traceId)
          ? this.options.contextAttributes?.(context)
          : undefined
      if (span) {
        for (const key of CONTEXT_ATTRIBUTES) {
          const value = span[key]
          if (value !== undefined) attributes[key] = value
        }
      }
      this.exporter.exportLogs([
        {
          timeUnixNano,
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
