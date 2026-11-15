/**
 * Strict base64 and SPKI helpers shared by `utils/hmac.ts` and the services.
 * Web Crypto only; no `Buffer`. They live in utils so that services may import
 * them without utils reaching back into services.
 */

/** Standard base64 (padded or not) to bytes; throws on anything else. */
export const base64ToBytes = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

/** Bytes to standard base64, or to unpadded base64url with `url`. */
export const bytesToBase64 = (bytes: Uint8Array, url = false): string => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const base64 = btoa(binary)
  return url
    ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : base64
}

/**
 * An SPKI PEM, or bare base64 DER, to its DER bytes: the one normaliser of
 * public keys. Throws if it is neither.
 */
export const spkiToDer = (publicKey: string): Uint8Array => {
  const text = publicKey
    .trim()
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error('a public key is not valid base64 SPKI')
  }
  return base64ToBytes(text)
}
