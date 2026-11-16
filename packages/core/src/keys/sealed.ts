import { fromCanonicalBase64Url } from './base64.js'

/**
 * The `kid` a sealed value (a compact JWE) names in its protected header, so
 * the service can find the key version to open it with. Pure parsing: nothing
 * here is trusted until `KeyCrypto.open` has checked it against the ledger.
 */
export const sealedKid = (sealed: string): string => {
  const parts = typeof sealed === 'string' ? sealed.split('.') : []
  if (parts.length !== 5) throw new Error('Not a sealed value.')
  const bytes = fromCanonicalBase64Url(parts[0]!)
  let kid: unknown
  try {
    kid = JSON.parse(new TextDecoder().decode(bytes))?.kid
  } catch {
    throw new Error('Not a sealed value.')
  }
  if (typeof kid !== 'string' || kid.length === 0) {
    throw new Error('Not a sealed value.')
  }
  return kid
}
