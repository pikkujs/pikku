import type { KeyAlgorithm } from '../wirings/keypair/index.js'

/** The JWS `alg` header value for a signing algorithm. */
export const JWS_ALG = { ed25519: 'EdDSA', rs256: 'RS256' } as const

/** The sealing envelope: a compact JWE, ECDH-ES with A256GCM, on an X25519 key. */
export const SEALED_ALG = 'ECDH-ES'
export const SEALED_ENC = 'A256GCM'

/** A key a {@link KeyCrypto} has imported. Opaque to the key service, which only caches and passes it back. */
export type KeyHandle = object

/** Which half of a pair {@link KeyCrypto.importKey} is given: PKCS8 DER (or PEM) for `private`, SPKI DER (or PEM) for `public`, base64. */
export type KeyHalf = 'private' | 'public'

export interface GeneratedKeyMaterial {
  /** SPKI DER, base64. */
  publicKey: string
  /** PKCS8 DER, base64. Never leaves the service except into custody. */
  privateKey: string
}

/** The protected header of a compact JWS that verified. */
export type JwsProtectedHeader = { alg?: string; kid?: string } & Record<
  string,
  unknown
>

/**
 * The cryptography the key service needs, and nothing it implements itself.
 * `@pikku/core/keys` ships no provider: pass one (`@pikku/jose/keys` is the
 * reference) as `crypto`. Every method takes the key algorithm the declaration
 * names, so a provider never sniffs it from key bytes.
 *
 * Signatures are compact JWS. The service owns the policy (which bytes, which
 * `alg` and `kid`) and checks what comes back; the provider owns the maths.
 */
export interface KeyCrypto {
  /** A fresh pair. Extractable only to the extent that the halves are returned. */
  generate(algorithm: KeyAlgorithm): Promise<GeneratedKeyMaterial>
  /** The RFC 7638 JWK thumbprint (SHA-256, base64url) of an SPKI public key: the key's `kid`. */
  thumbprint(algorithm: KeyAlgorithm, publicKey: string): Promise<string>
  /** Import one half for later use. The handle may be cached by the caller. */
  importKey(
    algorithm: KeyAlgorithm,
    half: KeyHalf,
    key: string
  ): Promise<KeyHandle>
  /**
   * A compact JWS over `payload` with exactly `header` as the protected header
   * (so `header.alg` must be the algorithm's JWS name, else the call throws).
   */
  sign(
    algorithm: 'ed25519' | 'rs256',
    privateKey: KeyHandle,
    header: Record<string, unknown>,
    payload: Uint8Array
  ): Promise<string>
  /**
   * The protected header when `jws` is a valid compact JWS under `publicKey`
   * for exactly this algorithm, else `undefined`. Never throws for a bad
   * signature or malformed input.
   */
  verify(
    algorithm: 'ed25519' | 'rs256',
    publicKey: KeyHandle,
    jws: string
  ): Promise<JwsProtectedHeader | undefined>
  /** The public half as an RFC 7517 JWK, without `kid`, `alg` or `use`. */
  jwk(
    algorithm: KeyAlgorithm,
    publicKey: KeyHandle
  ): Promise<{ kty: string } & Record<string, string>>
  /**
   * Seals `plaintext` to an X25519 SPKI public key as a compact JWE (ECDH-ES,
   * A256GCM) whose protected header carries `kid` and `apv` (the recipient SPKI,
   * base64url), so a value cannot be redirected to another recipient.
   */
  seal(
    recipientPublicKey: string,
    kid: string,
    plaintext: string
  ): Promise<string>
  /**
   * Opens a value from {@link seal}. Throws unless the header names exactly
   * `kid` and carries `apv` equal to `recipientPublicKey`.
   */
  open(
    privateKey: KeyHandle,
    recipientPublicKey: string,
    kid: string,
    sealed: string
  ): Promise<string>
}
