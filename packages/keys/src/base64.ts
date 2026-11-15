/**
 * Base64 and base64url over plain `btoa`/`atob`, so the root entry loads on
 * Workers and Bun as well as Node. `@pikku/core` keeps its equivalents private.
 */
const encoder = new TextEncoder()

export const utf8 = (value: string): Uint8Array => encoder.encode(value)

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const toBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Accepts base64 and base64url, padded or not. Throws on anything else. */
export const fromBase64 = (value: string): Uint8Array => {
  const normal = value.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normal)) {
    throw new Error('not base64')
  }
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', utf8(value) as BufferSource)
  )
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
