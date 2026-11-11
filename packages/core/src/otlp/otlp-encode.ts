import type { SpanKind } from '../tracer.js'
import { nowUnixNano } from '../tracer.js'
import { ProtobufWriter, unhex } from './protobuf-writer.js'
import {
  OTLP_SEVERITY,
  type EncodableSpan,
  type OtlpAttributes,
  type OtlpLogRecord,
  type OtlpMetricPoint,
  type OtlpResource,
} from './otlp-types.js'

/** The instrumentation scope every record is sent under. */
export const OTLP_SCOPE_NAME = '@pikku/core'

const SPAN_KIND: Record<SpanKind, number> = {
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
}

const STATUS_CODE = { unset: 0, ok: 1, error: 2 } as const

/** `AggregationTemporality.CUMULATIVE` */
const CUMULATIVE = 2

const writeAnyValue = (
  writer: ProtobufWriter,
  field: number,
  value: OtlpAttributes[string]
) => {
  writer.message(field, (any) => {
    if (typeof value === 'string') any.string(1, value)
    else if (typeof value === 'boolean') any.bool(2, value)
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) any.string(1, String(value))
      else if (Number.isSafeInteger(value)) any.varint(3, value)
      else any.double(4, value)
    } else if (Number.isFinite(value.double)) any.double(4, value.double)
    else any.string(1, String(value.double))
  })
}

const writeAttributes = (
  writer: ProtobufWriter,
  field: number,
  attributes: OtlpAttributes | undefined
) => {
  if (!attributes) return
  for (const [key, value] of Object.entries(attributes)) {
    writer.message(field, (pair) => {
      pair.string(1, key)
      writeAnyValue(pair, 2, value)
    })
  }
}

const resourceAttributes = (resource: OtlpResource): OtlpAttributes => ({
  'service.name': resource.serviceName,
  ...(resource.serviceVersion
    ? { 'service.version': resource.serviceVersion }
    : {}),
  ...(resource.environment
    ? { 'deployment.environment.name': resource.environment }
    : {}),
  ...(resource.project ? { 'pikku.project': resource.project } : {}),
  ...(resource.stage ? { 'pikku.stage': resource.stage } : {}),
})

const writeResource = (writer: ProtobufWriter, resource: OtlpResource) => {
  writer.message(1, (message) =>
    writeAttributes(message, 1, resourceAttributes(resource))
  )
}

const writeScope = (writer: ProtobufWriter) => {
  writer.message(1, (scope) => scope.string(1, OTLP_SCOPE_NAME))
}

/**
 * `ExportXServiceRequest { resource_x: [ { resource, scope_x: [ { scope, items } ] } ] }`:
 * all three signals share this nesting, and the items are field 2 inside the scope.
 */
const envelope = (
  resource: OtlpResource,
  writeItems: (scoped: ProtobufWriter) => void
): Uint8Array => {
  const request = new ProtobufWriter()
  request.message(1, (resourceItems) => {
    writeResource(resourceItems, resource)
    resourceItems.message(2, (scoped) => {
      writeScope(scoped)
      writeItems(scoped)
    })
  })
  return request.finish()
}

const writeSpan = (writer: ProtobufWriter, span: EncodableSpan) => {
  writer.raw(1, unhex(span.traceId))
  writer.raw(2, unhex(span.spanId))
  if (span.parentSpanId) writer.raw(4, unhex(span.parentSpanId))
  writer.string(5, span.name)
  writer.varint(6, SPAN_KIND[span.kind])
  writer.fixed64(7, span.startTimeUnixNano)
  writer.fixed64(8, span.endTimeUnixNano)
  writeAttributes(writer, 9, span.attributes)
  for (const event of span.events ?? []) {
    writer.message(11, (message) => {
      message.fixed64(1, event.timeUnixNano)
      message.string(2, event.name)
      writeAttributes(message, 3, event.attributes)
    })
  }
  writer.message(15, (status) => {
    if (span.status.message) status.string(2, span.status.message)
    status.varint(3, STATUS_CODE[span.status.code])
  })
}

/** `ExportTraceServiceRequest` for `spans`. */
export const encodeTraces = (
  resource: OtlpResource,
  spans: readonly EncodableSpan[]
): Uint8Array =>
  envelope(resource, (scoped) => {
    for (const span of spans) scoped.message(2, (w) => writeSpan(w, span))
  })

/** `ExportLogsServiceRequest` for `records`. */
export const encodeLogs = (
  resource: OtlpResource,
  records: readonly OtlpLogRecord[]
): Uint8Array =>
  envelope(resource, (scoped) => {
    for (const record of records) {
      scoped.message(2, (log) => {
        const time = record.timeUnixNano ?? nowUnixNano()
        log.fixed64(1, time)
        log.varint(2, OTLP_SEVERITY[record.severity])
        log.string(3, record.severity)
        writeAnyValue(log, 5, record.body)
        writeAttributes(log, 6, record.attributes)
        if (record.traceId) log.raw(9, unhex(record.traceId))
        if (record.spanId) log.raw(10, unhex(record.spanId))
        log.fixed64(11, time)
      })
    }
  })

const writeDataPoint = (
  writer: ProtobufWriter,
  point: OtlpMetricPoint,
  fallbackStart: bigint
) => {
  const time = point.timeUnixNano ?? nowUnixNano()
  writer.fixed64(2, point.startTimeUnixNano ?? fallbackStart)
  writer.fixed64(3, time)
  if (point.integer) writer.fixed64(6, BigInt(Math.round(point.value)))
  else writer.double(4, point.value)
  writeAttributes(writer, 7, point.attributes)
}

/**
 * `ExportMetricsServiceRequest`. Points that share a name and kind are one
 * `Metric` with several data points. A gauge is field 5, a cumulative monotonic
 * sum field 7. No histograms: the duration summary is computed from spans.
 */
export const encodeMetrics = (
  resource: OtlpResource,
  points: readonly OtlpMetricPoint[],
  startTimeUnixNano: bigint
): Uint8Array => {
  const groups = new Map<string, OtlpMetricPoint[]>()
  for (const point of points) {
    const key = `${point.kind}\u0000${point.name}\u0000${point.unit ?? ''}`
    const group = groups.get(key)
    if (group) group.push(point)
    else groups.set(key, [point])
  }
  return envelope(resource, (scoped) => {
    for (const group of groups.values()) {
      const first = group[0]!
      scoped.message(2, (metric) => {
        metric.string(1, first.name)
        if (first.unit) metric.string(3, first.unit)
        metric.message(first.kind === 'gauge' ? 5 : 7, (data) => {
          for (const point of group) {
            data.message(1, (dp) =>
              writeDataPoint(dp, point, startTimeUnixNano)
            )
          }
          if (first.kind === 'sum') {
            data.varint(2, CUMULATIVE)
            data.bool(3, true)
          }
        })
      })
    }
  })
}
