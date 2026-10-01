const PIKKU_WORKFLOW_NAMESPACE = '70696b6b-7500-5770-9f6c-6f77000a0001'

const encoder = new TextEncoder()

const parseUuid = (uuid: string): Uint8Array => {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

const formatUuid = (bytes: Uint8Array): string => {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * SHA-1 (FIPS 180-4). Web Crypto only offers an async digest and `uuidv5` is
 * called synchronously (and is a public export), so this is a small pure-JS
 * one. It only derives dedupe IDs, never anything secret.
 */
const sha1 = (message: Uint8Array): Uint8Array => {
  const padded = new Uint8Array(((message.length + 9 + 63) >> 6) << 6)
  padded.set(message)
  padded[message.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor((message.length * 8) / 2 ** 32))
  view.setUint32(padded.length - 4, (message.length * 8) >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotl(a, 5) + f + e + k + w[i]!) >>> 0
      e = d
      d = c
      c = rotl(b, 30) >>> 0
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  ;[h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h))
  return out
}

export const uuidv5 = (
  name: string,
  namespace: string = PIKKU_WORKFLOW_NAMESPACE
): string => {
  const ns = parseUuid(namespace)
  const nameBytes = encoder.encode(name)
  const input = new Uint8Array(ns.length + nameBytes.length)
  input.set(ns)
  input.set(nameBytes, ns.length)
  const bytes = sha1(input).subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return formatUuid(bytes)
}

export const deriveInvocationId = (runId: string, stepName: string): string =>
  uuidv5(`${runId}:${stepName}`)
