/**
 * OTLP/HTTP protobuf encoding for the three signals the store writes.
 *
 * GreptimeDB's OTLP endpoint accepts protobuf only (JSON is a 400), so this is
 * a small hand-written encoder for exactly the fields the store sets, with no
 * schema and no dependency. It is deliberately private to this addon: the same
 * encoding lives in `@pikku/core/otlp` on the otlp-exporter branch, and the two
 * should be one module once that branch lands (see the knowledge note).
 */

const TEXT = new TextEncoder()
const MASK_64 = (1n << 64n) - 1n

const VARINT = 0
const FIXED64 = 1
const LENGTH_DELIMITED = 2

class ProtobufWriter {
  private bytes = new Uint8Array(256)
  private length = 0

  private reserve(extra: number) {
    const needed = this.length + extra
    if (needed <= this.bytes.length) return
    let capacity = this.bytes.length * 2
    while (capacity < needed) capacity *= 2
    const grown = new Uint8Array(capacity)
    grown.set(this.bytes.subarray(0, this.length))
    this.bytes = grown
  }

  private rawVarint(value: bigint) {
    let rest = value & MASK_64
    this.reserve(10)
    while (rest > 0x7fn) {
      this.bytes[this.length++] = Number(rest & 0x7fn) | 0x80
      rest >>= 7n
    }
    this.bytes[this.length++] = Number(rest)
  }

  private tag(field: number, wireType: number) {
    this.rawVarint(BigInt((field << 3) | wireType))
  }

  varint(field: number, value: number | bigint) {
    this.tag(field, VARINT)
    this.rawVarint(BigInt(value))
  }

  bool(field: number, value: boolean) {
    this.varint(field, value ? 1 : 0)
  }

  fixed64(field: number, value: bigint) {
    this.tag(field, FIXED64)
    this.reserve(8)
    let rest = value & MASK_64
    for (let index = 0; index < 8; index++) {
      this.bytes[this.length++] = Number(rest & 0xffn)
      rest >>= 8n
    }
  }

  double(field: number, value: number) {
    this.tag(field, FIXED64)
    this.reserve(8)
    new DataView(this.bytes.buffer).setFloat64(this.length, value, true)
    this.length += 8
  }

  raw(field: number, value: Uint8Array) {
    this.tag(field, LENGTH_DELIMITED)
    this.rawVarint(BigInt(value.length))
    this.reserve(value.length)
    this.bytes.set(value, this.length)
    this.length += value.length
  }

  string(field: number, value: string) {
    this.raw(field, TEXT.encode(value))
  }

  message(field: number, build: (writer: ProtobufWriter) => void) {
    const nested = new ProtobufWriter()
    build(nested)
    this.raw(field, nested.finish())
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length)
  }
}

const unhex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return out
}

/** A double that must stay a double on the wire even when it is a whole number. */
export interface OtlpDouble {
  readonly double: number
}
export type OtlpValue = string | number | boolean | OtlpDouble
export type OtlpAttributes = Record<string, OtlpValue>

export interface OtlpResource {
  serviceName: string
  environment: string
  project: string
  stage: string
}

export type OtlpSeverityText =
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const SEVERITY_NUMBER: Record<OtlpSeverityText, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
}

export interface EncodableLog {
  timeUnixNano: bigint
  severity: OtlpSeverityText
  body: string
  attributes: OtlpAttributes
  traceId?: string
  spanId?: string
}

export interface EncodableSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
  startTimeUnixNano: bigint
  endTimeUnixNano: bigint
  status: 'ok' | 'error' | 'unset'
  statusMessage?: string
  attributes: OtlpAttributes
}

export interface EncodableGauge {
  name: string
  timeUnixNano: bigint
  value: number
  attributes: OtlpAttributes
}

const SPAN_KIND = {
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
} as const
const STATUS_CODE = { unset: 0, ok: 1, error: 2 } as const

const writeValue = (
  writer: ProtobufWriter,
  field: number,
  value: OtlpValue
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
  attributes: OtlpAttributes
) => {
  for (const [key, value] of Object.entries(attributes)) {
    writer.message(field, (pair) => {
      pair.string(1, key)
      writeValue(pair, 2, value)
    })
  }
}

/** The resource attributes the read side scopes by. */
const resourceAttributes = (resource: OtlpResource): OtlpAttributes => ({
  'service.name': resource.serviceName,
  'deployment.environment.name': resource.environment,
  'pikku.project': resource.project,
  'pikku.stage': resource.stage,
})

const envelope = (
  resource: OtlpResource,
  writeItems: (scoped: ProtobufWriter) => void
): Uint8Array => {
  const request = new ProtobufWriter()
  request.message(1, (resourceItems) => {
    resourceItems.message(1, (message) =>
      writeAttributes(message, 1, resourceAttributes(resource))
    )
    resourceItems.message(2, (scoped) => {
      scoped.message(1, (scope) => scope.string(1, '@pikku/addon-greptime'))
      writeItems(scoped)
    })
  })
  return request.finish()
}

const checkId = (what: string, id: string, length: number): string => {
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(id)) {
    throw new TypeError(
      `${what} must be ${length} hex characters, got '${id.slice(0, 40)}'`
    )
  }
  return id.toLowerCase()
}

/**
 * A log line's id as bytes, or nothing. A line's ids come from text nobody
 * validated (a stdout line), and one bad id must not cost the rest of the
 * batch, so an id that is not hex of the right length is left off the record.
 */
const optionalId = (id: string | undefined, length: number) => {
  if (!id || !new RegExp(`^[0-9a-fA-F]{${length}}$`).test(id)) return undefined
  return unhex(id.toLowerCase())
}

export const encodeLogs = (
  resource: OtlpResource,
  records: readonly EncodableLog[]
): Uint8Array =>
  envelope(resource, (scoped) => {
    for (const record of records) {
      scoped.message(2, (log) => {
        log.fixed64(1, record.timeUnixNano)
        log.varint(2, SEVERITY_NUMBER[record.severity])
        log.string(3, record.severity)
        writeValue(log, 5, record.body)
        writeAttributes(log, 6, record.attributes)
        const traceId = optionalId(record.traceId, 32)
        if (traceId) log.raw(9, traceId)
        const spanId = optionalId(record.spanId, 16)
        if (spanId) log.raw(10, spanId)
        log.fixed64(11, record.timeUnixNano)
      })
    }
  })

export const encodeTraces = (
  resource: OtlpResource,
  spans: readonly EncodableSpan[]
): Uint8Array =>
  envelope(resource, (scoped) => {
    for (const span of spans) {
      scoped.message(2, (w) => {
        w.raw(1, unhex(checkId('traceId', span.traceId, 32)))
        w.raw(2, unhex(checkId('spanId', span.spanId, 16)))
        if (span.parentSpanId) {
          w.raw(4, unhex(checkId('parentSpanId', span.parentSpanId, 16)))
        }
        w.string(5, span.name)
        w.varint(6, SPAN_KIND[span.kind])
        w.fixed64(7, span.startTimeUnixNano)
        w.fixed64(8, span.endTimeUnixNano)
        writeAttributes(w, 9, span.attributes)
        w.message(15, (status) => {
          if (span.statusMessage) status.string(2, span.statusMessage)
          status.varint(3, STATUS_CODE[span.status])
        })
      })
    }
  })

/** Gauges only: the store never writes a counter or a histogram. */
export const encodeGauges = (
  resource: OtlpResource,
  points: readonly EncodableGauge[]
): Uint8Array => {
  const byName = new Map<string, EncodableGauge[]>()
  for (const point of points) {
    const group = byName.get(point.name)
    if (group) group.push(point)
    else byName.set(point.name, [point])
  }
  return envelope(resource, (scoped) => {
    for (const [name, group] of byName) {
      scoped.message(2, (metric) => {
        metric.string(1, name)
        metric.message(5, (gauge) => {
          for (const point of group) {
            gauge.message(1, (dp) => {
              dp.fixed64(3, point.timeUnixNano)
              dp.double(4, point.value)
              writeAttributes(dp, 7, point.attributes)
            })
          }
        })
      })
    }
  })
}
