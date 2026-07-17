import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-SHA256 a payload, hex-encoded.
 *
 * Senders wrap this in their own scheme prefix (`sha256=`, `v0=`, …).
 *
 * @param secret - The signing key shared with the other side
 * @param payload - The exact bytes that were signed
 */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Compare two signatures without leaking their contents through timing.
 *
 * Returns false rather than throwing on a length mismatch, which is what
 * `timingSafeEqual` does when the buffers differ in size.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}
