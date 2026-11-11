const TEXT = new TextEncoder()

/** Wire types the OTLP messages use. */
const VARINT = 0
const FIXED64 = 1
const LENGTH_DELIMITED = 2

const MASK_64 = (1n << 64n) - 1n

/**
 * The few protobuf wire primitives OTLP needs: varints, fixed64, doubles and
 * length-delimited fields. No schema, no reflection, no dependency: the
 * message layouts live in `otlp-encode.ts`.
 */
export class ProtobufWriter {
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
    // Negative numbers are the two's complement 64-bit pattern, as protobuf
    // writes an int64 (ten bytes).
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

  /** An int32/int64/uint/enum field. */
  varint(field: number, value: number | bigint) {
    this.tag(field, VARINT)
    this.rawVarint(BigInt(value))
  }

  bool(field: number, value: boolean) {
    this.varint(field, value ? 1 : 0)
  }

  /** A fixed64/sfixed64 field: eight little-endian bytes. */
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

  /** A `bytes` field. */
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

  /** A nested message, written by `build` into its own writer. */
  message(field: number, build: (writer: ProtobufWriter) => void) {
    const nested = new ProtobufWriter()
    build(nested)
    this.raw(field, nested.finish())
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length)
  }
}

/** Lowercase hex to bytes; the caller has already checked the shape. */
export const unhex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return out
}
