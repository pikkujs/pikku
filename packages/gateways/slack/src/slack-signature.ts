import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify a Slack request signature.
 *
 * Slack signs every webhook request with HMAC-SHA256 using your app's signing secret.
 * This prevents anyone from spoofing events to your webhook endpoint.
 *
 * @param signingSecret - Your Slack app's signing secret (from app settings)
 * @param signature - The `X-Slack-Signature` header value (e.g., `v0=abc123...`)
 * @param timestamp - The `X-Slack-Request-Timestamp` header value (Unix seconds)
 * @param body - The raw request body string
 * @returns true if the signature is valid
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 300) {
    return false
  }

  // Construct the signature base string: v0:{timestamp}:{body}
  const sigBaseString = `v0:${timestamp}:${body}`

  // Compute HMAC-SHA256
  const computed =
    'v0=' +
    createHmac('sha256', signingSecret).update(sigBaseString).digest('hex')

  // Timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}
