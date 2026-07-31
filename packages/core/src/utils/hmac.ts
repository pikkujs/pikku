import { createHmac, timingSafeEqual } from 'node:crypto'

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
