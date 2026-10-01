/**
 * Hashes and HMACs for the crypto function, on Web Crypto. MD5 is not in Web
 * Crypto, so it is implemented here (RFC 1321). HMAC is built over the digest
 * (RFC 2104) rather than `subtle.sign`, which rejects an empty key and MD5.
 */

import { toBase64, toHex, utf8Encode } from './bytes.js'

export type DigestAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'

const SUBTLE_NAMES: Record<Exclude<DigestAlgorithm, 'md5'>, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
}

/** Hash block size in bytes, which HMAC pads its key to. */
const BLOCK_SIZE: Record<DigestAlgorithm, number> = {
  md5: 64,
  sha1: 64,
  sha256: 64,
  sha384: 128,
  sha512: 128,
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
]
const K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32)
)

export function md5(data: Uint8Array): Uint8Array {
  const length = data.length
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6)
  padded.set(data)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (length << 3) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(length / 2 ** 29), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const word = view.getUint32(offset + g * 4, true)
      const sum = (a + f + K[i]! + word) | 0
      a = d
      d = c
      c = b
      b = (b + ((sum << S[i]!) | (sum >>> (32 - S[i]!)))) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }
  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0 >>> 0, true)
  outView.setUint32(4, b0 >>> 0, true)
  outView.setUint32(8, c0 >>> 0, true)
  outView.setUint32(12, d0 >>> 0, true)
  return out
}

export async function digestBytes(
  algorithm: DigestAlgorithm,
  data: Uint8Array
): Promise<Uint8Array> {
  if (algorithm === 'md5') return md5(data)
  const hash = await globalThis.crypto.subtle.digest(
    SUBTLE_NAMES[algorithm],
    data as BufferSource
  )
  return new Uint8Array(hash)
}

export async function hmacBytes(
  algorithm: DigestAlgorithm,
  key: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const blockSize = BLOCK_SIZE[algorithm]
  const block = new Uint8Array(blockSize)
  block.set(key.length > blockSize ? await digestBytes(algorithm, key) : key)
  const inner = new Uint8Array(blockSize + data.length)
  const outerPad = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    inner[i] = block[i]! ^ 0x36
    outerPad[i] = block[i]! ^ 0x5c
  }
  inner.set(data, blockSize)
  const innerDigest = await digestBytes(algorithm, inner)
  const outer = new Uint8Array(blockSize + innerDigest.length)
  outer.set(outerPad)
  outer.set(innerDigest, blockSize)
  return digestBytes(algorithm, outer)
}

export const encodeDigest = (
  bytes: Uint8Array,
  encoding: 'hex' | 'base64'
): string => (encoding === 'base64' ? toBase64(bytes) : toHex(bytes))

export const hashText = async (
  algorithm: DigestAlgorithm,
  text: string,
  encoding: 'hex' | 'base64'
): Promise<string> =>
  encodeDigest(await digestBytes(algorithm, utf8Encode(text)), encoding)

export const hmacText = async (
  algorithm: DigestAlgorithm,
  key: string,
  text: string,
  encoding: 'hex' | 'base64'
): Promise<string> =>
  encodeDigest(
    await hmacBytes(algorithm, utf8Encode(key), utf8Encode(text)),
    encoding
  )
