import { VirtualUserStatementError } from './virtual-user-statement.js'

/** One entry of the list form of `VIRTUAL_USER_VERIFY_KEY`. */
export interface VirtualUserVerifyKeyEntry {
  /** Names the key in a statement header. Defaults to the RFC 7638 thumbprint of the key. */
  kid?: string
  /** SPKI, as a PEM or as the single-line base64 DER a stage variable carries. */
  publicKey: string
}

/** What `VIRTUAL_USER_VERIFY_KEY` may hold: one key, or a list of them. */
export type VirtualUserVerifyKeys = string | VirtualUserVerifyKeyEntry[]

/** A verify key checked and normalised: `kid` only when it was given explicitly. */
export interface ParsedVirtualUserVerifyKey {
  kid?: string
  /** SPKI DER, base64 on one line. */
  publicKey: string
}

/** The most keys a stage holds at once: the current one, plus those mid-rotation. */
export const VIRTUAL_USER_VERIFY_KEYS_MAX = 4

// SubjectPublicKeyInfo of an Ed25519 key: this 12-byte prefix, then the 32-byte key.
const ED25519_SPKI_PREFIX = '302a300506032b6570032100'
const ED25519_SPKI_LENGTH = 44
// The same layout for X25519 (OID 1.3.101.110): key pairs of purpose sealing
// are named by the same RFC 7638 OKP thumbprint, with crv X25519.
const X25519_SPKI_PREFIX = '302a300506032b656e032100'

const fail = (message: string): never => {
  throw new VirtualUserStatementError(
    `Invalid VIRTUAL_USER_VERIFY_KEY: ${message}`
  )
}

import { base64ToBytes, bytesToBase64, spkiToDer } from '../utils/base64.js'

export { base64ToBytes, bytesToBase64, spkiToDer }

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const spkiBytes = (publicKey: string): Uint8Array => {
  try {
    return spkiToDer(publicKey)
  } catch {
    return fail('a public key is not valid base64 SPKI')
  }
}

/** An Ed25519 SPKI, PEM or bare base64 DER, to base64 DER on one line. */
const spkiBase64 = (
  publicKey: string,
  prefixes: string[] = [ED25519_SPKI_PREFIX]
): string => {
  const bytes = spkiBytes(publicKey)
  if (
    bytes.length !== ED25519_SPKI_LENGTH ||
    !prefixes.includes(hex(bytes.subarray(0, 12)))
  ) {
    return fail('a public key is not an Ed25519 SPKI key')
  }
  return bytesToBase64(bytes)
}

/**
 * The RFC 7638 JWK thumbprint of an Ed25519 or X25519 public key: the SHA-256
 * of `{"crv":"Ed25519","kty":"OKP","x":"..."}` (members in canonical order),
 * base64url. Async because core only has WebCrypto digests.
 *
 * `spki` is a PEM or base64 DER; anything but an Ed25519 or X25519 SPKI throws.
 */
export const okpThumbprint = async (spki: string): Promise<string> => {
  const bytes = base64ToBytes(
    spkiBase64(spki, [ED25519_SPKI_PREFIX, X25519_SPKI_PREFIX])
  )
  const crv =
    hex(bytes.subarray(0, 12)) === X25519_SPKI_PREFIX ? 'X25519' : 'Ed25519'
  const x = bytesToBase64(bytes.subarray(12), true)
  const canonical = `{"crv":"${crv}","kty":"OKP","x":"${x}"}`
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  )
  return bytesToBase64(new Uint8Array(digest), true)
}

/**
 * The RFC 7638 JWK thumbprint of an RSA public key: the SHA-256 of
 * `{"e":"...","kty":"RSA","n":"..."}` (members in canonical order), base64url.
 * Async (WebCrypto). `spki` is a PEM or base64 DER; anything but an RSA SPKI throws.
 */
export const rsaThumbprint = async (spki: string): Promise<string> => {
  let jwk: JsonWebKey
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      spkiBytes(spki) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify']
    )
    jwk = await crypto.subtle.exportKey('jwk', key)
  } catch (error) {
    if (error instanceof VirtualUserStatementError) throw error
    return fail('a public key is not an RSA SPKI key')
  }
  const canonical = `{"e":"${jwk.e}","kty":"RSA","n":"${jwk.n}"}`
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  )
  return bytesToBase64(new Uint8Array(digest), true)
}

/**
 * Parses what `VIRTUAL_USER_VERIFY_KEY` holds: one key (PEM or base64 SPKI,
 * exactly as before), or a JSON list of `{kid?, publicKey}`. A list may also
 * arrive already parsed, because the variables service JSON-parses values.
 *
 * Checked synchronously and fail closed (a start-up error, not a runtime
 * rejection): the value must be one of those forms, hold 1 to
 * {@link VIRTUAL_USER_VERIFY_KEYS_MAX} Ed25519 keys, with no repeated `kid`
 * and no repeated key. Thumbprints are not computed here (they are async); a
 * key without a `kid` is named by {@link okpThumbprint} when first needed.
 */
export const parseVirtualUserVerifyKeys = (
  value: VirtualUserVerifyKeys
): ParsedVirtualUserVerifyKey[] => {
  let list: unknown
  if (typeof value === 'string') {
    // `[` is unambiguous: a PEM starts with `-` and a base64 SPKI with `M`.
    if (!value.trim().startsWith('[')) {
      return [{ publicKey: spkiBase64(value) }]
    }
    try {
      list = JSON.parse(value)
    } catch {
      return fail('it starts with `[` but is not valid JSON')
    }
  } else {
    list = value
  }
  if (!Array.isArray(list)) {
    return fail('expected a public key or a list of { kid, publicKey }')
  }
  if (list.length === 0) return fail('the list of keys is empty')
  if (list.length > VIRTUAL_USER_VERIFY_KEYS_MAX) {
    return fail(`at most ${VIRTUAL_USER_VERIFY_KEYS_MAX} keys are allowed`)
  }
  const kids = new Set<string>()
  const keys = new Set<string>()
  return list.map((entry): ParsedVirtualUserVerifyKey => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return fail('every list entry must be { kid?, publicKey }')
    }
    const { kid, publicKey, ...rest } = entry as Record<string, unknown>
    if (Object.keys(rest).length > 0) {
      return fail(`unknown field in a list entry: ${Object.keys(rest)[0]}`)
    }
    if (typeof publicKey !== 'string') {
      return fail('every list entry needs a string publicKey')
    }
    if (kid !== undefined && (typeof kid !== 'string' || kid === '')) {
      return fail('kid must be a non-empty string')
    }
    if (typeof kid === 'string') {
      if (kids.has(kid)) return fail(`duplicate kid ${kid}`)
      kids.add(kid)
    }
    const normalised = spkiBase64(publicKey)
    if (keys.has(normalised)) return fail('the same key is listed twice')
    keys.add(normalised)
    return typeof kid === 'string'
      ? { kid, publicKey: normalised }
      : { publicKey: normalised }
  })
}
