import type { WrappedValue } from './data-classification.js'
import { WeakKeyMaterialError } from './errors/errors.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const getSubtle = () => {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) {
    throw new Error('WebCrypto not available')
  }
  return crypto.subtle
}

const base64Encode = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

const base64Decode = (input: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(input, 'base64'))
  }
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const toBase64Url = (bytes: Uint8Array): string => {
  return base64Encode(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const fromBase64Url = (input: string): Uint8Array => {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  return base64Decode(base64)
}

const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const PBKDF2_ITERATIONS = 600_000

const deriveKey = async (
  secret: string,
  salt: Uint8Array
): Promise<CryptoKey> => {
  const subtle = getSubtle()
  const material = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export const encryptJSON = async (
  secret: string,
  value: unknown
): Promise<string> => {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('WebCrypto not available')
  }
  const subtle = getSubtle()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(secret, salt)
  const plaintext = encoder.encode(JSON.stringify(value))
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )
  const cipherBytes = new Uint8Array(encrypted)
  const out = new Uint8Array(salt.length + iv.length + cipherBytes.length)
  out.set(salt, 0)
  out.set(iv, salt.length)
  out.set(cipherBytes, salt.length + iv.length)
  return toBase64Url(out)
}

export const decryptJSON = async <T>(
  secret: string,
  token: string
): Promise<T> => {
  const subtle = getSubtle()
  const data = fromBase64Url(token)
  if (data.length <= SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid encrypted payload')
  }
  const salt = data.slice(0, SALT_BYTES)
  const iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = data.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(secret, salt)
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(decoder.decode(new Uint8Array(decrypted))) as T
}

/**
 * Namespaces the remote-RPC session key so the same deployment secret used for
 * another purpose derives a different key. See knowledge/crypto.md.
 */
export const REMOTE_SESSION_INFO = 'pikku:remote-session'

export const MIN_KEY_MATERIAL_LENGTH = 32

export const assertStrongKeyMaterial = (
  name: string,
  keyMaterial: string
): void => {
  if (keyMaterial.length < MIN_KEY_MATERIAL_LENGTH) {
    throw new WeakKeyMaterialError(
      name,
      MIN_KEY_MATERIAL_LENGTH,
      keyMaterial.length
    )
  }
}

const expandKeyMaterial = async (
  keyMaterial: string,
  info: string,
  salt: Uint8Array
): Promise<CryptoKey> => {
  const subtle = getSubtle()
  const material = await subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    'HKDF',
    false,
    ['deriveKey']
  )
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: encoder.encode(info) as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export const encryptWithKeyMaterial = async (
  name: string,
  keyMaterial: string,
  info: string,
  value: unknown
): Promise<string> => {
  assertStrongKeyMaterial(name, keyMaterial)
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('WebCrypto not available')
  }
  const subtle = getSubtle()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await expandKeyMaterial(keyMaterial, info, salt)
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value))
  )
  const cipherBytes = new Uint8Array(encrypted)
  const out = new Uint8Array(salt.length + iv.length + cipherBytes.length)
  out.set(salt, 0)
  out.set(iv, salt.length)
  out.set(cipherBytes, salt.length + iv.length)
  return toBase64Url(out)
}

export const decryptWithKeyMaterial = async <T>(
  name: string,
  keyMaterial: string,
  info: string,
  token: string
): Promise<T> => {
  assertStrongKeyMaterial(name, keyMaterial)
  const subtle = getSubtle()
  const data = fromBase64Url(token)
  if (data.length <= SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid encrypted payload')
  }
  const salt = data.slice(0, SALT_BYTES)
  const iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = data.slice(SALT_BYTES + IV_BYTES)
  const key = await expandKeyMaterial(keyMaterial, info, salt)
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(decoder.decode(new Uint8Array(decrypted))) as T
}

export const encodeBase64UrlText = (value: string): string =>
  toBase64Url(encoder.encode(value))

export const decodeBase64UrlText = (value: string): string =>
  decoder.decode(fromBase64Url(value))

const expandSigningKeyMaterial = async (
  keyMaterial: string,
  info: string
): Promise<CryptoKey> => {
  const subtle = getSubtle()
  const material = await subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    'HKDF',
    false,
    ['deriveKey']
  )
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as BufferSource,
      info: encoder.encode(info) as BufferSource,
    },
    material,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/**
 * HMAC-SHA256 over `payload` under a key expanded from high-entropy key
 * material, base64url-encoded. The salt is empty by design so the verifier can
 * re-derive the key from `keyMaterial` and `info` alone.
 */
export const signWithKeyMaterial = async (
  name: string,
  keyMaterial: string,
  info: string,
  payload: string
): Promise<string> => {
  assertStrongKeyMaterial(name, keyMaterial)
  const key = await expandSigningKeyMaterial(keyMaterial, info)
  const signature = await getSubtle().sign(
    'HMAC',
    key,
    encoder.encode(payload) as BufferSource
  )
  return toBase64Url(new Uint8Array(signature))
}

/** False — never throws — for a malformed, truncated or mismatched signature. */
export const verifyWithKeyMaterial = async (
  name: string,
  keyMaterial: string,
  info: string,
  payload: string,
  signature: string
): Promise<boolean> => {
  assertStrongKeyMaterial(name, keyMaterial)
  const key = await expandSigningKeyMaterial(keyMaterial, info)
  try {
    return await getSubtle().verify(
      'HMAC',
      key,
      fromBase64Url(signature) as BufferSource,
      encoder.encode(payload) as BufferSource
    )
  } catch {
    return false
  }
}

const importRawKey = async (rawBytes: Uint8Array): Promise<CryptoKey> => {
  const subtle = getSubtle()
  return subtle.importKey(
    'raw',
    rawBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  )
}

const encryptWithCryptoKey = async (
  key: CryptoKey,
  value: unknown
): Promise<string> => {
  const crypto = globalThis.crypto
  const subtle = getSubtle()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value))
  )
  const cipherBytes = new Uint8Array(encrypted)
  const out = new Uint8Array(iv.length + cipherBytes.length)
  out.set(iv, 0)
  out.set(cipherBytes, iv.length)
  return toBase64Url(out)
}

const decryptWithCryptoKey = async <T>(
  key: CryptoKey,
  token: string
): Promise<T> => {
  const subtle = getSubtle()
  const data = fromBase64Url(token)
  if (data.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid encrypted payload')
  }
  const iv = data.slice(0, IV_BYTES)
  const ciphertext = data.slice(IV_BYTES)
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(decoder.decode(new Uint8Array(decrypted))) as T
}

export const generateDEK = async (): Promise<string> => {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return toBase64Url(raw)
}

/**
 * One salt per (deployment, key version), stored beside the wrapped DEKs.
 * See knowledge/crypto.md.
 */
export const generateKEKSalt = (): string => {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('WebCrypto not available')
  }
  return toBase64Url(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

export const deriveKEK = async (
  passphrase: string,
  salt: string
): Promise<CryptoKey> => {
  return deriveKey(passphrase, fromBase64Url(salt))
}

/**
 * The one place a `WrappedValue` is minted. Every branded return below routes
 * through here, so the assertion "these bytes really are ciphertext" is made
 * once and audited once instead of at each call site.
 */
const asWrapped = (ciphertext: string): WrappedValue =>
  ciphertext as WrappedValue

export const wrapDEK = async (
  kek: CryptoKey,
  plaintextDEK: string
): Promise<WrappedValue> => {
  return asWrapped(await encryptWithCryptoKey(kek, plaintextDEK))
}

export const unwrapDEK = async (
  kek: CryptoKey,
  wrappedDEK: string
): Promise<string> => {
  return decryptWithCryptoKey<string>(kek, wrappedDEK)
}

const encryptWithDEK = async (
  dekBase64: string,
  value: unknown
): Promise<string> => {
  return encryptWithCryptoKey(
    await importRawKey(fromBase64Url(dekBase64)),
    value
  )
}

const decryptWithDEK = async <T>(
  dekBase64: string,
  token: string
): Promise<T> => {
  return decryptWithCryptoKey<T>(
    await importRawKey(fromBase64Url(dekBase64)),
    token
  )
}

export interface EnvelopeEncryptResult {
  ciphertext: WrappedValue
  wrappedDEK: WrappedValue
}

export const envelopeEncrypt = async (
  kek: CryptoKey,
  value: unknown
): Promise<EnvelopeEncryptResult> => {
  const dek = await generateDEK()
  const ciphertext = asWrapped(await encryptWithDEK(dek, value))
  const wrappedDEK = await wrapDEK(kek, dek)
  return { ciphertext, wrappedDEK }
}

/**
 * Note the inputs are plain `string`, not `WrappedValue`.
 *
 * The brand exists to stop plaintext being *written* to a wrapped column, and
 * a `WrappedValue` is assignable to `string`, so a branded caller still passes
 * without a cast. Demanding the brand here would buy nothing — feeding the
 * wrong string in already fails at the AEAD tag — while forcing a cast into
 * every path that reads ciphertext back out of a row, a parsed envelope, or the
 * wire, which is exactly where casts are least reviewable.
 */
export const envelopeDecrypt = async <T>(
  kek: CryptoKey,
  ciphertext: string,
  wrappedDEK: string
): Promise<T> => {
  const dek = await unwrapDEK(kek, wrappedDEK)
  return decryptWithDEK<T>(dek, ciphertext)
}

export const envelopeRewrap = async (
  oldKEK: CryptoKey,
  newKEK: CryptoKey,
  wrappedDEK: string
): Promise<WrappedValue> => {
  const dek = await unwrapDEK(oldKEK, wrappedDEK)
  return wrapDEK(newKEK, dek)
}
