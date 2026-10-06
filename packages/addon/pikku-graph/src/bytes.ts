/**
 * Byte and text encodings on Web APIs only (`TextEncoder`, `atob`, `btoa`), so
 * the functions that use them load where there is no `Buffer`.
 */

const encoder = new TextEncoder()
// Keep a leading BOM, as `Buffer#toString` does.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

export type ByteEncoding = 'utf8' | 'base64' | 'hex'

export const utf8Encode = (text: string): Uint8Array => encoder.encode(text)

export const utf8Decode = (bytes: Uint8Array): string => decoder.decode(bytes)

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Like `Buffer.from(text, 'base64')`: url-safe alphabet and missing padding are accepted. */
export const fromBase64 = (text: string): Uint8Array => {
  let clean = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '')
  while (clean.length % 4 !== 0) {
    if (clean.length % 4 === 1) {
      clean = clean.slice(0, -1)
      continue
    }
    clean += '='
  }
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** Like `Buffer.from(text, 'hex')`: stops at the first invalid pair, ignores a trailing nibble. */
export const fromHex = (text: string): Uint8Array => {
  const out: number[] = []
  for (let i = 0; i + 1 < text.length; i += 2) {
    const byte = parseInt(text.slice(i, i + 2), 16)
    if (!/^[0-9a-fA-F]{2}$/.test(text.slice(i, i + 2))) break
    out.push(byte)
  }
  return Uint8Array.from(out)
}

export const encodeBytes = (
  bytes: Uint8Array,
  encoding: ByteEncoding = 'utf8'
): string => {
  switch (encoding) {
    case 'base64':
      return toBase64(bytes)
    case 'hex':
      return toHex(bytes)
    default:
      return utf8Decode(bytes)
  }
}

export const decodeText = (
  text: string,
  encoding: ByteEncoding = 'utf8'
): Uint8Array => {
  switch (encoding) {
    case 'base64':
      return fromBase64(text)
    case 'hex':
      return fromHex(text)
    default:
      return utf8Encode(text)
  }
}
