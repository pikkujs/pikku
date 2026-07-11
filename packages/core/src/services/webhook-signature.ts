import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Sign a webhook body with HMAC-SHA256.
 *
 * @param secret - The signing key shared with the receiver
 * @param body - The raw request body string
 * @returns The `X-Pikku-Signature` header value (e.g., `sha256=abc123...`)
 */
export function signWebhookBody(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Verify a webhook signature produced by {@link signWebhookBody}.
 *
 * @param secret - The signing key shared with the sender
 * @param signature - The `X-Pikku-Signature` header value
 * @param body - The raw request body string
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  secret: string,
  signature: string,
  body: string
): boolean {
  const computed = signWebhookBody(secret, body)
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}
