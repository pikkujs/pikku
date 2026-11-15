import { importSpkiVerifyKey } from '@pikku/core/hmac'
import { okpThumbprint, rsaThumbprint } from '@pikku/core/services'
import type { KeyAlgorithm } from '@pikku/core/keypair'
import { fromBase64, toBase64 } from './base64.js'

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('WebCrypto is not available')
  return s
}

/** The JWS `alg` header value for a signing algorithm. */
export const JWS_ALG = { ed25519: 'EdDSA', rs256: 'RS256' } as const

export type GeneratedKeyPair = {
  /** SPKI DER, base64. */
  publicKey: string
  /** PKCS8 DER, base64. Never leaves the service except into custody. */
  privateKey: string
  /** The RFC 7638 thumbprint of `publicKey`. */
  kid: string
}

const GENERATE: Record<KeyAlgorithm, () => Promise<CryptoKeyPair>> = {
  ed25519: () =>
    subtle().generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ]) as Promise<CryptoKeyPair>,
  x25519: () =>
    subtle().generateKey({ name: 'X25519' }, true, [
      'deriveBits',
    ]) as Promise<CryptoKeyPair>,
  rs256: () =>
    subtle().generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    ) as Promise<CryptoKeyPair>,
}

/** The kid of a public key: its RFC 7638 thumbprint (OKP for ed25519 and x25519, RSA for rs256). */
export const kidFor = (
  algorithm: KeyAlgorithm,
  spki: string
): Promise<string> =>
  algorithm === 'rs256' ? rsaThumbprint(spki) : okpThumbprint(spki)

export const generateKeyPair = async (
  algorithm: KeyAlgorithm
): Promise<GeneratedKeyPair> => {
  const pair = await GENERATE[algorithm]()
  const publicKey = toBase64(
    new Uint8Array(await subtle().exportKey('spki', pair.publicKey))
  )
  const privateKey = toBase64(
    new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey))
  )
  return { publicKey, privateKey, kid: await kidFor(algorithm, publicKey) }
}

/** PKCS8 as base64 DER or as a PEM, to its DER bytes. */
export const pkcs8Bytes = (value: string): Uint8Array =>
  fromBase64(
    value.trim().startsWith('-----BEGIN')
      ? value.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
      : value.trim()
  )

/** A non-extractable signing key from a PKCS8 private half. */
export const importSigningKey = (
  privateKey: string,
  algorithm: 'ed25519' | 'rs256'
): Promise<CryptoKey> =>
  subtle().importKey(
    'pkcs8',
    pkcs8Bytes(privateKey) as BufferSource,
    algorithm === 'ed25519'
      ? { name: 'Ed25519' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

export const signBytes = async (
  key: CryptoKey,
  algorithm: 'ed25519' | 'rs256',
  data: Uint8Array
): Promise<Uint8Array> =>
  new Uint8Array(
    await subtle().sign(
      algorithm === 'ed25519' ? { name: 'Ed25519' } : 'RSASSA-PKCS1-v1_5',
      key,
      data as BufferSource
    )
  )

/** A verify key from an SPKI public half: core's one import helper, the algorithm taken from the ledger record. */
export const importVerifyKey = (
  publicKey: string,
  algorithm: 'ed25519' | 'rs256'
): Promise<CryptoKey> => importSpkiVerifyKey(fromBase64(publicKey), algorithm)

/** The public half as an RFC 7517 JWK (without `kid`, `alg` and `use`), from an already imported verify key. */
export const publicJwk = async (
  verifyKey: CryptoKey,
  algorithm: 'ed25519' | 'rs256'
): Promise<{ kty: string } & Record<string, string>> => {
  const jwk = await subtle().exportKey('jwk', verifyKey)
  return algorithm === 'ed25519'
    ? { kty: 'OKP', crv: 'Ed25519', x: jwk.x! }
    : { kty: 'RSA', n: jwk.n!, e: jwk.e! }
}
