import { createHMAC } from '@better-auth/utils/hmac'

const tryDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
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
  try {
    const valid = await createHMAC('SHA-256', 'base64urlnopad').verify(
      secret,
      token,
      signature
    )
    return valid ? token : null
  } catch {
    return null
  }
}
