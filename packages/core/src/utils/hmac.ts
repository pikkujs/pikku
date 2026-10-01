import { createHmac, createVerify, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-SHA256 of a payload, hex-encoded. Senders wrap this in their own scheme
 * prefix (`sha256=`, `v0=`, …).
 */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Constant-time signature comparison. Returns false on a length mismatch,
 * where `timingSafeEqual` itself throws.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export type WebhookPayload = string | Uint8Array
export type HmacAlgorithm = 'sha1' | 'sha256' | 'sha512'
export type SecretEncoding = 'utf8' | 'hex' | 'base64'

/** The HMAC of `payload` under `secret`, for handshakes that answer with a digest. */
export function hmacDigest(
  secret: string,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): string {
  return createHmac(algorithm, Buffer.from(secret, secretEncoding))
    .update(payload)
    .digest(encoding)
}

/** Whether `signature` is the HMAC of `payload` under `secret`, compared in constant time. */
export function verifyHmacSignature(
  secret: string,
  signature: string | undefined,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): boolean {
  return (
    !!signature &&
    timingSafeStringEqual(
      signature,
      hmacDigest(secret, algorithm, payload, encoding, secretEncoding)
    )
  )
}

/** Whether `signature` (base64) is `payload` signed by the private half of `publicKey` (PEM). */
export function verifyPublicKeySignature(
  publicKey: string,
  signature: string | undefined,
  payload: WebhookPayload,
  options: { algorithm?: string; dsaEncoding?: 'der' | 'ieee-p1363' } = {}
): boolean {
  if (!signature) return false
  try {
    return createVerify(options.algorithm ?? 'sha256')
      .update(payload)
      .verify(
        { key: publicKey, dsaEncoding: options.dsaEncoding },
        signature,
        'base64'
      )
  } catch {
    return false
  }
}
