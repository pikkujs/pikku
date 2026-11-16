import { base64ToBytes, bytesToBase64 } from '@pikku/core/services'

/** One base64 implementation: core's. This file adds only the strict signature form and two digests. */
export {
  base64ToBytes as fromBase64,
  bytesToBase64 as toBase64,
} from '@pikku/core/services'

const encoder = new TextEncoder()

export const utf8 = (value: string): Uint8Array => encoder.encode(value)

export const toBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes, true)

/**
 * Decodes a signature only if it is the canonical unpadded base64url encoding
 * of its bytes: no standard alphabet, padding, whitespace or non-zero trailing
 * bits, so one signature has exactly one accepted string (a replay cache or
 * dedupe keyed on the string cannot be bypassed by re-encoding).
 */
export const fromCanonicalBase64Url = (
  value: string
): Uint8Array | undefined => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  try {
    const bytes = base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'))
    return bytesToBase64(bytes, true) === value ? bytes : undefined
  } catch {
    return undefined
  }
}

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', utf8(value) as BufferSource)
  )
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
