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

const deriveKey = async (secret: string): Promise<CryptoKey> => {
  const subtle = getSubtle()
  const hash = await subtle.digest('SHA-256', encoder.encode(secret))
  return subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
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
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(secret)
  const plaintext = encoder.encode(JSON.stringify(value))
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )
  const cipherBytes = new Uint8Array(encrypted)
  const out = new Uint8Array(iv.length + cipherBytes.length)
  out.set(iv, 0)
  out.set(cipherBytes, iv.length)
  return toBase64Url(out)
}

export const decryptJSON = async <T>(
  secret: string,
  token: string
): Promise<T> => {
  const subtle = getSubtle()
  const data = fromBase64Url(token)
  if (data.length < 13) {
    throw new Error('Invalid encrypted payload')
  }
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const key = await deriveKey(secret)
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(decoder.decode(new Uint8Array(decrypted))) as T
}

/**
 * Envelope encryption utilities.
 *
 * Each secret gets its own random DEK (data encryption key).
 * The DEK is wrapped (encrypted) by a KEK (key encryption key) — typically an env var.
 * The actual secret is encrypted with the DEK.
 *
 * KEK rotation only re-wraps the DEK, never touches the ciphertext.
 */

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

export const generateDEK = async (): Promise<string> => {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return toBase64Url(raw)
}

export const wrapDEK = async (
  kek: string,
  plaintextDEK: string
): Promise<string> => {
  return encryptJSON(kek, plaintextDEK)
}

export const unwrapDEK = async (
  kek: string,
  wrappedDEK: string
): Promise<string> => {
  return decryptJSON<string>(kek, wrappedDEK)
}

const encryptWithDEK = async (
  dekBase64: string,
  value: unknown
): Promise<string> => {
  const crypto = globalThis.crypto
  const subtle = getSubtle()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importRawKey(fromBase64Url(dekBase64))
  const plaintext = encoder.encode(JSON.stringify(value))
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )
  const cipherBytes = new Uint8Array(encrypted)
  const out = new Uint8Array(iv.length + cipherBytes.length)
  out.set(iv, 0)
  out.set(cipherBytes, iv.length)
  return toBase64Url(out)
}

const decryptWithDEK = async <T>(
  dekBase64: string,
  token: string
): Promise<T> => {
  const subtle = getSubtle()
  const data = fromBase64Url(token)
  if (data.length < 13) {
    throw new Error('Invalid encrypted payload')
  }
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const key = await importRawKey(fromBase64Url(dekBase64))
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(decoder.decode(new Uint8Array(decrypted))) as T
}

export interface EnvelopeEncryptResult {
  ciphertext: string
  wrappedDEK: string
}

export const envelopeEncrypt = async (
  kek: string,
  value: unknown
): Promise<EnvelopeEncryptResult> => {
  const dek = await generateDEK()
  const ciphertext = await encryptWithDEK(dek, value)
  const wrappedDEK = await wrapDEK(kek, dek)
  return { ciphertext, wrappedDEK }
}

export const envelopeDecrypt = async <T>(
  kek: string,
  ciphertext: string,
  wrappedDEK: string
): Promise<T> => {
  const dek = await unwrapDEK(kek, wrappedDEK)
  return decryptWithDEK<T>(dek, ciphertext)
}

export const envelopeRewrap = async (
  oldKEK: string,
  newKEK: string,
  wrappedDEK: string
): Promise<string> => {
  const dek = await unwrapDEK(oldKEK, wrappedDEK)
  return wrapDEK(newKEK, dek)
}
