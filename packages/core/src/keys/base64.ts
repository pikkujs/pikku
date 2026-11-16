import { base64ToBytes, bytesToBase64 } from '../utils/base64.js'

/** One base64 implementation: core's. This file adds only the strict signature form and two digests. */
export {
  base64ToBytes as fromBase64,
  bytesToBase64 as toBase64,
} from '../utils/base64.js'

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

/** PKCS8 as base64 DER or as a PEM, to its DER bytes. */
export const pkcs8Bytes = (value: string): Uint8Array =>
  base64ToBytes(
    value.trim().startsWith('-----BEGIN')
      ? value.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
      : value.trim()
  )
