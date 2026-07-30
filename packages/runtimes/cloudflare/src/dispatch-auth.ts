import type { CloudflareEnv } from './env.js'

/**
 * Env var holding the shared secret for the `/__pikku/*-job` dispatch routes.
 * Matches `@pikku/node-http-server`'s `dispatchSecret`, which the cloudflare
 * deploy adapter already sources from `PIKKU_DISPATCH_SECRET`, so one secret
 * covers both worker and container dispatch targets.
 */
export const DISPATCH_SECRET_ENV_VAR = 'PIKKU_DISPATCH_SECRET'

export const DISPATCH_SECRET_HEADER = 'x-pikku-dispatch'

const encoder = new TextEncoder()

/**
 * Double-HMAC comparison. Both values are signed under a key generated freshly
 * per call, so the digests that actually get compared are fixed-width and
 * unpredictable to the caller — this leaks neither the secret's bytes nor its
 * length through timing, which a byte-wise compare with an early length exit
 * would.
 */
export const constantTimeEqual = async (
  a: string,
  b: string
): Promise<boolean> => {
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
  ])
  const bytesA = new Uint8Array(digestA)
  const bytesB = new Uint8Array(digestB)
  let difference = bytesA.length ^ bytesB.length
  for (let i = 0; i < bytesA.length; i++) {
    difference |= bytesA[i]! ^ bytesB[i]!
  }
  return difference === 0
}

export const isDispatchAuthorized = async (
  request: Request,
  env: CloudflareEnv
): Promise<boolean> => {
  const expected = env[DISPATCH_SECRET_ENV_VAR]
  if (typeof expected !== 'string' || expected.length === 0) {
    console.error(
      `[DISPATCH] Rejecting dispatch request: ${DISPATCH_SECRET_ENV_VAR} is not set on this worker. Set it (\`wrangler secret put ${DISPATCH_SECRET_ENV_VAR}\`) to the same value the dispatcher sends in the \`${DISPATCH_SECRET_HEADER}\` header.`
    )
    return false
  }
  const provided = request.headers.get(DISPATCH_SECRET_HEADER)
  if (provided === null) {
    return false
  }
  return constantTimeEqual(provided, expected)
}

/**
 * Deliberately opaque — never distinguishes an unset secret from a mismatched
 * one, so a prober learns nothing about the deployment's configuration.
 */
export const dispatchUnauthorizedResponse = (): Response =>
  new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
