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
