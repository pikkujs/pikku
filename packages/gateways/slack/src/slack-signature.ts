import { hmacSha256Hex, timingSafeStringEqual } from '@pikku/core/hmac'

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
export async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  // Fail closed on a missing secret or signature
  if (!signingSecret || !signature) return false

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 300) {
    return false
  }

  // Construct the signature base string: v0:{timestamp}:{body}
  const sigBaseString = `v0:${timestamp}:${body}`

  const computed = 'v0=' + (await hmacSha256Hex(signingSecret, sigBaseString))

  return timingSafeStringEqual(computed, signature)
}
