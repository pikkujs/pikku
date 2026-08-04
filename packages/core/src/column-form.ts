// knowledge: decisions/internals/core-column-form-is-an-axis-of-its-own.md
import type {
  HashedValue,
  SealedValue,
  WrappedValue,
} from './data-classification.js'

/**
 * SHA-256 of a credential, lowercase hex — the sole producer of `HashedValue`.
 *
 * Deliberately unpeppered. These are high-entropy random bearer tokens, not
 * passwords: there is no candidate set to search, so a pepper would add a key
 * to manage and a rotation story to own while buying nothing. A column holding
 * a *low*-entropy secret is not a `hashed` column — it wants a password KDF and
 * a different type entirely.
 *
 * Async because it runs on WebCrypto rather than `node:crypto`, so the same
 * code path works in a Worker. Callers that hash a bearer token on every
 * request are already async.
 */
export const hashToken = async (raw: string): Promise<HashedValue> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('WebCrypto not available')
  }
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  )
  let hex = ''
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex as HashedValue
}

/**
 * Assert that a string already in storage is ciphertext of the given form.
 *
 * The brands exist so that new writes must come from a real encrypt/hash call,
 * but three paths legitimately hold such a value as a bare `string`: a
 * migration backfilling rows written before the column declared its form, a
 * test fixture, and a value arriving over the wire from a service that sealed
 * it elsewhere. Each of those is a promise the caller is making, not something
 * the type system can check — which is why these are named to be greppable and
 * why there is no non-`unsafe` spelling. If one of these appears in ordinary
 * request-handling code, that is the bug.
 */
export const unsafeAsWrapped = (stored: string): WrappedValue =>
  stored as WrappedValue

/** See `unsafeAsWrapped`. */
export const unsafeAsSealed = (stored: string): SealedValue =>
  stored as SealedValue

/** See `unsafeAsWrapped`. */
export const unsafeAsHashed = (stored: string): HashedValue =>
  stored as HashedValue
