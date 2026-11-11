import type { FinishedSpan, SpanAttributeValue } from '../tracer.js'

/** Per-process facts sent as the OTLP resource on every request. */
export interface OtlpResource {
  serviceName: string
  serviceVersion?: string
  /** `deployment.environment.name`: the stage, a named environment. */
  environment?: string
  project?: string
  stage?: string
}

/** A double that must stay a double on the wire even when it is a whole number. */
export interface OtlpDouble {
  readonly double: number
}

export type OtlpAttributeValue = SpanAttributeValue | OtlpDouble

export type OtlpAttributes = Record<string, OtlpAttributeValue>

/** OTLP `SeverityNumber` for the levels a Pikku logger has. */
export const OTLP_SEVERITY = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  critical: 21,
} as const

export type OtlpSeverity = keyof typeof OTLP_SEVERITY

export interface OtlpLogRecord {
  /** Defaults to now. */
  timeUnixNano?: bigint
  severity: OtlpSeverity
  body: string
  attributes?: Record<string, SpanAttributeValue>
  traceId?: string
  spanId?: string
}

export interface OtlpMetricPoint {
  /** Dotted OTel name, e.g. `process.memory.rss`. */
  name: string
  unit?: string
  /** `gauge` is a sampled value; `sum` a cumulative, monotonic counter. */
  kind: 'gauge' | 'sum'
  value: number
  /** Sent as an int64 instead of a double. */
  integer?: boolean
  /** Defaults to now. */
  timeUnixNano?: bigint
  /** For a `sum`: when the counter started. Defaults to the exporter's start. */
  startTimeUnixNano?: bigint
  attributes?: Record<string, SpanAttributeValue>
}

/** A finished span whose attributes have been given their OTLP types. */
export type EncodableSpan = Omit<FinishedSpan, 'attributes'> & {
  attributes: OtlpAttributes
}
