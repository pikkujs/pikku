/**
 * A test-only OTLP/protobuf reader, independent of the encoder it checks: a
 * generic wire parser plus the field numbers of the three export requests.
 * Verifiers and exporter tests decode what was actually sent with it.
 */

type Field = { field: number; wire: number; value: bigint | Uint8Array }

const parseFields = (bytes: Uint8Array): Field[] => {
  const fields: Field[] = []
  let at = 0
  const varint = (): bigint => {
    let result = 0n
    let shift = 0n
    for (;;) {
      const byte = bytes[at++]
      if (byte === undefined) throw new Error('truncated varint')
      result |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return result
      shift += 7n
    }
  }
  while (at < bytes.length) {
    const key = Number(varint())
    const field = key >> 3
    const wire = key & 7
    if (wire === 0) fields.push({ field, wire, value: varint() })
    else if (wire === 1) {
      let value = 0n
      for (let index = 7; index >= 0; index--) {
        value = (value << 8n) | BigInt(bytes[at + index]!)
      }
      at += 8
      fields.push({ field, wire, value })
    } else if (wire === 2) {
      const length = Number(varint())
      if (at + length > bytes.length) throw new Error('truncated field')
      fields.push({ field, wire, value: bytes.slice(at, at + length) })
      at += length
    } else throw new Error(`unsupported wire type ${wire}`)
  }
  return fields
}

const all = (fields: Field[], field: number) =>
  fields.filter((f) => f.field === field).map((f) => f.value)
const one = (fields: Field[], field: number) => all(fields, field)[0]
const bytes = (value: unknown) => value as Uint8Array
const text = (value: unknown) => new TextDecoder().decode(bytes(value))
const hex = (value: unknown) =>
  Array.from(bytes(value), (b) => b.toString(16).padStart(2, '0')).join('')
const double = (value: bigint) => {
  const view = new DataView(new ArrayBuffer(8))
  view.setBigUint64(0, value)
  return view.getFloat64(0)
}

export type DecodedValue =
  { string: string } | { bool: boolean } | { int: bigint } | { double: number }

const anyValue = (raw: Uint8Array): DecodedValue => {
  const [f] = parseFields(raw)
  if (!f) return { string: '' }
  if (f.field === 1) return { string: text(f.value) }
  if (f.field === 2) return { bool: f.value === 1n }
  if (f.field === 3) return { int: BigInt.asIntN(64, f.value as bigint) }
  return { double: double(f.value as bigint) }
}

/** Attributes as `{ key: DecodedValue }`. */
const attributes = (fields: Field[], field: number) => {
  const out: Record<string, DecodedValue> = {}
  for (const raw of all(fields, field)) {
    const pair = parseFields(bytes(raw))
    out[text(one(pair, 1))] = anyValue(bytes(one(pair, 2) ?? new Uint8Array()))
  }
  return out
}

const resource = (envelope: Field[]) => {
  const raw = one(envelope, 1)
  return raw ? attributes(parseFields(bytes(raw)), 1) : {}
}

const scoped = (envelope: Field[]) =>
  all(envelope, 2).flatMap((raw) => {
    const scope = parseFields(bytes(raw))
    return all(scope, 2).map((item) => parseFields(bytes(item)))
  })

export interface DecodedSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: number
  startTimeUnixNano: bigint
  endTimeUnixNano: bigint
  attributes: Record<string, DecodedValue>
  events: {
    name: string
    timeUnixNano: bigint
    attributes: Record<string, DecodedValue>
  }[]
  status: { code: number; message?: string }
}

export interface DecodedLog {
  timeUnixNano: bigint
  severityNumber: number
  severityText: string
  body: DecodedValue
  attributes: Record<string, DecodedValue>
  traceId?: string
  spanId?: string
}

export interface DecodedMetric {
  name: string
  unit?: string
  type: 'gauge' | 'sum'
  monotonic?: boolean
  temporality?: number
  points: {
    startTimeUnixNano: bigint
    timeUnixNano: bigint
    value: number | bigint
    attributes: Record<string, DecodedValue>
  }[]
}

export interface DecodedExport<T> {
  resource: Record<string, DecodedValue>
  items: T[]
}

const requestItems = <T>(
  body: Uint8Array,
  decode: (item: Field[]) => T
): DecodedExport<T> => {
  const request = parseFields(body)
  const envelopes = all(request, 1).map((raw) => parseFields(bytes(raw)))
  return {
    resource: envelopes[0] ? resource(envelopes[0]) : {},
    items: envelopes.flatMap((envelope) => scoped(envelope).map(decode)),
  }
}

export const decodeTraces = (body: Uint8Array): DecodedExport<DecodedSpan> =>
  requestItems(body, (f) => {
    const status = parseFields(bytes(one(f, 15) ?? new Uint8Array()))
    return {
      traceId: hex(one(f, 1)),
      spanId: hex(one(f, 2)),
      ...(one(f, 4) ? { parentSpanId: hex(one(f, 4)) } : {}),
      name: text(one(f, 5)),
      kind: Number(one(f, 6) ?? 0n),
      startTimeUnixNano: one(f, 7) as bigint,
      endTimeUnixNano: one(f, 8) as bigint,
      attributes: attributes(f, 9),
      events: all(f, 11).map((raw) => {
        const event = parseFields(bytes(raw))
        return {
          timeUnixNano: one(event, 1) as bigint,
          name: text(one(event, 2)),
          attributes: attributes(event, 3),
        }
      }),
      status: {
        code: Number(one(status, 3) ?? 0n),
        ...(one(status, 2) ? { message: text(one(status, 2)) } : {}),
      },
    }
  })

export const decodeLogs = (body: Uint8Array): DecodedExport<DecodedLog> =>
  requestItems(body, (f) => ({
    timeUnixNano: one(f, 1) as bigint,
    severityNumber: Number(one(f, 2) ?? 0n),
    severityText: text(one(f, 3)),
    body: anyValue(bytes(one(f, 5) ?? new Uint8Array())),
    attributes: attributes(f, 6),
    ...(one(f, 9) ? { traceId: hex(one(f, 9)) } : {}),
    ...(one(f, 10) ? { spanId: hex(one(f, 10)) } : {}),
  }))

export const decodeMetrics = (body: Uint8Array): DecodedExport<DecodedMetric> =>
  requestItems(body, (f) => {
    const type = one(f, 5) ? 'gauge' : 'sum'
    const data = parseFields(bytes(one(f, 5) ?? one(f, 7)))
    return {
      name: text(one(f, 1)),
      ...(one(f, 3) ? { unit: text(one(f, 3)) } : {}),
      type,
      ...(type === 'sum'
        ? {
            monotonic: one(data, 3) === 1n,
            temporality: Number(one(data, 2) ?? 0n),
          }
        : {}),
      points: all(data, 1).map((raw) => {
        const dp = parseFields(bytes(raw))
        const asDouble = one(dp, 4)
        const asInt = one(dp, 6)
        return {
          startTimeUnixNano: one(dp, 2) as bigint,
          timeUnixNano: one(dp, 3) as bigint,
          value:
            asDouble !== undefined
              ? double(asDouble as bigint)
              : BigInt.asIntN(64, (asInt as bigint) ?? 0n),
          attributes: attributes(dp, 7),
        }
      }),
    }
  })
