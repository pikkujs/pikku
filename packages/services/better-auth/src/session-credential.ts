const tryDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * better-call signs with standard, padded base64; accepting the URL-safe
 * alphabet and a missing pad as well costs nothing and tolerates a client that
 * re-encoded the value.
 */
const decodeSignature = (signature: string): Uint8Array<ArrayBuffer> | null => {
  const standard = signature.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Recovers the better-auth session token from the `token.signature` pair the
 * server issues, verifying the signature with the same HMAC better-auth signs
 * it with — so a forged or truncated credential is rejected before it costs a
 * store read.
 *
 * The same pair arrives on both transports: better-auth writes it as the
 * session cookie value, and its `bearer()` plugin echoes that same value on
 * `set-auth-token` for a client to send back on `Authorization`.
 *
 * A signature is required. `bearer()` will accept a bare unsigned token and
 * sign it on the way in, which is safe there because the token is itself
 * unguessable — but it gives up the cheap rejection that is the reason this
 * middleware checks anything before touching the store.
 */
export const verifySessionCredential = async (
  credential: string,
  secret: string
): Promise<string | null> => {
  const value = credential.includes('%') ? tryDecode(credential) : credential
  const parts = value.split('.')
  if (parts.length !== 2) {
    return null
  }
  const [token, signature] = parts as [string, string]
  if (!token || !signature) {
    return null
  }
  const signatureBytes = decodeSignature(signature)
  if (!signatureBytes) {
    return null
  }
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(token)
  )
  return valid ? token : null
}
