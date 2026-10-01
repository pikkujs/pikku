/**
 * Web Crypto only: no `node:crypto` and no `Buffer`, so this loads on edge
 * runtimes. Web Crypto is async, so everything that touches a key returns a
 * Promise; `timingSafeStringEqual` is plain JS and stays synchronous.
 */

const encoder = new TextEncoder()

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('WebCrypto not available')
  return s
}

const bytesToHex = (bytes: Uint8Array): string => {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Lenient like Node's `Buffer.from(_, 'hex')`: stops at the first bad pair. */
const hexToBytes = (hex: string): Uint8Array => {
  const out: number[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const pair = hex.slice(i, i + 2)
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) break
    out.push(parseInt(pair, 16))
  }
  return Uint8Array.from(out)
}

/** Lenient like Node's `Buffer.from(_, 'base64')`: accepts base64url, ignores junk. */
const base64ToBytes = (value: string): Uint8Array => {
  let clean = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '')
  if (clean.length % 4 === 1) clean = clean.slice(0, -1)
  clean += '='.repeat((4 - (clean.length % 4)) % 4)
  const binary = atob(clean)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Constant-time string comparison (pure JS; for opaque tokens, not HMACs, which
 * `verifyHmacSignature` checks with Web Crypto). Returns false on a length mismatch
 * (the lengths of the two values are not secret).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export type WebhookPayload = string | Uint8Array
export type HmacAlgorithm = 'sha1' | 'sha256' | 'sha512'
export type SecretEncoding = 'utf8' | 'hex' | 'base64'

const HMAC_HASH: Record<HmacAlgorithm, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512',
}

const rawSecretBytes = (
  secret: string,
  encoding: SecretEncoding
): Uint8Array =>
  encoding === 'hex'
    ? hexToBytes(secret)
    : encoding === 'base64'
      ? base64ToBytes(secret)
      : encoder.encode(secret)

const secretBytes = (secret: string, encoding: SecretEncoding): Uint8Array => {
  const bytes = rawSecretBytes(secret, encoding)
  // Web Crypto refuses a zero-length key. HMAC zero-pads the key to the block
  // size, so a single zero byte is the same key as an empty one. Only signing
  // reaches here: verification refuses an empty key outright.
  return bytes.length ? bytes : new Uint8Array(1)
}

const hmacBytes = async (
  secret: string,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  secretEncoding: SecretEncoding = 'utf8'
): Promise<Uint8Array> => {
  const hash = HMAC_HASH[algorithm]
  if (!hash) throw new Error(`Unsupported HMAC algorithm '${algorithm}'`)
  const key = await subtle().importKey(
    'raw',
    secretBytes(secret, secretEncoding) as BufferSource,
    { name: 'HMAC', hash },
    false,
    ['sign']
  )
  const data = typeof payload === 'string' ? encoder.encode(payload) : payload
  return new Uint8Array(await subtle().sign('HMAC', key, data as BufferSource))
}

/**
 * HMAC-SHA256 of a payload, hex-encoded. Senders wrap this in their own scheme
 * prefix (`sha256=`, `v0=`, …).
 */
export async function hmacSha256Hex(
  secret: string,
  payload: string
): Promise<string> {
  return bytesToHex(await hmacBytes(secret, 'sha256', payload))
}

/** The HMAC of `payload` under `secret`, for handshakes that answer with a digest. */
export async function hmacDigest(
  secret: string,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): Promise<string> {
  const digest = await hmacBytes(secret, algorithm, payload, secretEncoding)
  return encoding === 'hex' ? bytesToHex(digest) : bytesToBase64(digest)
}

/**
 * Whether `signature` is the HMAC of `payload` under `secret`. Fails closed on
 * an empty secret (or one that decodes to an empty key) and on a missing or
 * malformed signature. The comparison is `crypto.subtle.verify('HMAC', ...)`,
 * so it runs in the platform's constant-time implementation.
 */
export async function verifyHmacSignature(
  secret: string,
  signature: string | undefined,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): Promise<boolean> {
  if (!secret || !signature) return false
  try {
    const hash = HMAC_HASH[algorithm]
    if (!hash) return false
    const keyBytes = rawSecretBytes(secret, secretEncoding)
    if (!keyBytes.length) return false
    if (encoding === 'hex' && !/^(?:[0-9a-fA-F]{2})+$/.test(signature)) {
      return false
    }
    const sig =
      encoding === 'hex' ? hexToBytes(signature) : base64ToBytes(signature)
    if (!sig.length) return false
    const key = await subtle().importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'HMAC', hash },
      false,
      ['verify']
    )
    const data = typeof payload === 'string' ? encoder.encode(payload) : payload
    return await subtle().verify(
      'HMAC',
      key,
      sig as BufferSource,
      data as BufferSource
    )
  } catch {
    return false
  }
}

// DER prefixes of the SPKI algorithm identifiers we can import.
const OID_RSA = '06092a864886f70d010101'
const OID_EC = '06072a8648ce3d0201'
const OID_ED25519 = '06032b6570'
const EC_CURVES: Record<string, { name: string; size: number }> = {
  '06082a8648ce3d030107': { name: 'P-256', size: 32 },
  '06052b81040022': { name: 'P-384', size: 48 },
  '06052b81040023': { name: 'P-521', size: 66 },
}

const SIGNATURE_HASH: Record<string, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
}

const pemToDer = (pem: string): Uint8Array =>
  base64ToBytes(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''))

/** Reads an ASN.1 DER length at `offset`; returns [length, bytesUsed]. */
const readLength = (der: Uint8Array, offset: number): [number, number] => {
  const first = der[offset]!
  if (first < 0x80) return [first, 1]
  const count = first & 0x7f
  let length = 0
  for (let i = 0; i < count; i++) length = (length << 8) | der[offset + 1 + i]!
  return [length, 1 + count]
}

/** An ECDSA signature as DER `SEQUENCE { r, s }` to the fixed-width `r || s` Web Crypto expects. */
const derToP1363 = (der: Uint8Array, size: number): Uint8Array => {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature')
  let offset = 1 + readLength(der, 1)[1]
  const out = new Uint8Array(size * 2)
  for (let part = 0; part < 2; part++) {
    if (der[offset] !== 0x02) throw new Error('Invalid DER signature')
    const [length, used] = readLength(der, offset + 1)
    let integer = der.slice(offset + 1 + used, offset + 1 + used + length)
    while (integer.length > size && integer[0] === 0) integer = integer.slice(1)
    if (integer.length > size) throw new Error('Invalid DER signature')
    out.set(integer, part * size + (size - integer.length))
    offset += 1 + used + length
  }
  return out
}

/**
 * Whether `signature` (base64) is `payload` signed by the private half of
 * `publicKey` (an RSA, EC or Ed25519 PEM `SPKI` key). RSA-PSS keys are not
 * supported and verify as false. Ed25519 ignores `algorithm` and `dsaEncoding`.
 */
export async function verifyPublicKeySignature(
  publicKey: string,
  signature: string | undefined,
  payload: WebhookPayload,
  options: { algorithm?: string; dsaEncoding?: 'der' | 'ieee-p1363' } = {}
): Promise<boolean> {
  if (!publicKey || !signature) return false
  try {
    const der0 = pemToDer(publicKey)
    if (bytesToHex(der0).includes(OID_ED25519)) {
      const key = await subtle().importKey(
        'spki',
        der0 as BufferSource,
        { name: 'Ed25519' },
        false,
        ['verify']
      )
      return await subtle().verify(
        { name: 'Ed25519' },
        key,
        base64ToBytes(signature) as BufferSource,
        (typeof payload === 'string'
          ? encoder.encode(payload)
          : payload) as BufferSource
      )
    }
    const hash =
      SIGNATURE_HASH[
        (options.algorithm ?? 'sha256')
          .toLowerCase()
          .replace(/^rsa-/, '')
          .replace(/-/g, '')
      ]
    if (!hash) return false
    const der = pemToDer(publicKey)
    const hex = bytesToHex(der)
    const data = typeof payload === 'string' ? encoder.encode(payload) : payload
    const sig = base64ToBytes(signature)
    if (hex.includes(OID_RSA)) {
      const key = await subtle().importKey(
        'spki',
        der as BufferSource,
        { name: 'RSASSA-PKCS1-v1_5', hash },
        false,
        ['verify']
      )
      return await subtle().verify(
        'RSASSA-PKCS1-v1_5',
        key,
        sig as BufferSource,
        data as BufferSource
      )
    }
    const curve = hex.includes(OID_EC)
      ? Object.entries(EC_CURVES).find(([oid]) => hex.includes(oid))?.[1]
      : undefined
    if (!curve) return false
    const key = await subtle().importKey(
      'spki',
      der as BufferSource,
      { name: 'ECDSA', namedCurve: curve.name },
      false,
      ['verify']
    )
    const raw =
      options.dsaEncoding === 'ieee-p1363' ? sig : derToP1363(sig, curve.size)
    return await subtle().verify(
      { name: 'ECDSA', hash },
      key,
      raw as BufferSource,
      data as BufferSource
    )
  } catch {
    return false
  }
}
