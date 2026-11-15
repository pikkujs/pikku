import { fromBase64, toBase64, utf8 } from './base64.js'

/**
 * `sealed-x25519-v1`: an ephemeral X25519 key, ECDH against the recipient,
 * HKDF-SHA256 to a content key, AES-256-GCM. Written from the documented MIT
 * format (the seal half in `@pikku/addon-cloud-cli`), on WebCrypto so it runs
 * wherever the key service does. Both public keys go into the HKDF `info`, as
 * full SPKI DER (44 bytes each, not the raw 32), which is what stops a sealed
 * value being redirected to another recipient.
 */
export const SEALED_BOX_ALGORITHM = 'sealed-x25519-v1'
const SEAL_SALT = 'pikkufabric/sealed-box/v1'
const SPKI_LENGTH = 44

export interface SealedValue {
  alg: typeof SEALED_BOX_ALGORITHM
  /** The key version whose public half sealed this. */
  kid: string
  /** Ephemeral public key, SPKI DER as base64. */
  epk: string
  iv: string
  ct: string
  tag: string
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

const contentKey = async (
  shared: ArrayBuffer,
  epk: Uint8Array,
  recipient: Uint8Array
): Promise<CryptoKey> => {
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ])
  const info = new Uint8Array(epk.length + recipient.length)
  info.set(epk, 0)
  info.set(recipient, epk.length)
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(SEAL_SALT) as BufferSource,
      info: info as BufferSource,
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Seal `plaintext` to a recipient's SPKI public key (base64). */
export const seal = async (
  recipientPublicKey: string,
  kid: string,
  plaintext: string
): Promise<SealedValue> => {
  const recipientDer = fromBase64(recipientPublicKey)
  const recipient = await subtle().importKey(
    'spki',
    recipientDer as BufferSource,
    { name: 'X25519' },
    false,
    []
  )
  const ephemeral = (await subtle().generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const epk = new Uint8Array(
    await subtle().exportKey('spki', ephemeral.publicKey)
  )
  const shared = await subtle().deriveBits(
    { name: 'X25519', public: recipient },
    ephemeral.privateKey,
    256
  )
  const key = await contentKey(shared, epk, recipientDer)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
      key,
      utf8(plaintext) as BufferSource
    )
  )
  return {
    alg: SEALED_BOX_ALGORITHM,
    kid,
    epk: toBase64(epk),
    iv: toBase64(iv),
    ct: toBase64(sealed.subarray(0, sealed.length - 16)),
    tag: toBase64(sealed.subarray(sealed.length - 16)),
  }
}

/** Parses the wire form, refusing anything that is not a `sealed-x25519-v1` envelope. */
export const parseSealedValue = (sealed: string | SealedValue): SealedValue => {
  let value: Partial<SealedValue>
  try {
    value = typeof sealed === 'string' ? JSON.parse(sealed) : sealed
  } catch {
    throw new Error('Not a sealed-x25519-v1 envelope.')
  }
  if (
    value?.alg !== SEALED_BOX_ALGORITHM ||
    ['kid', 'epk', 'iv', 'ct', 'tag'].some(
      (f) => typeof (value as Record<string, unknown>)[f] !== 'string'
    )
  ) {
    throw new Error('Not a sealed-x25519-v1 envelope.')
  }
  return value as SealedValue
}

/**
 * Open a sealed value with the recipient's PKCS8 private half. `recipientPublicKey`
 * is the SPKI stored in the ledger, not re-derived from the private half.
 */
export const open = async (
  privateKey: CryptoKey,
  recipientPublicKey: string,
  sealed: SealedValue
): Promise<string> => {
  const epk = fromBase64(sealed.epk)
  if (epk.length !== SPKI_LENGTH) throw new Error('Invalid sealed envelope.')
  const ephemeral = await subtle().importKey(
    'spki',
    epk as BufferSource,
    { name: 'X25519' },
    false,
    []
  )
  const shared = await subtle().deriveBits(
    { name: 'X25519', public: ephemeral },
    privateKey,
    256
  )
  const key = await contentKey(shared, epk, fromBase64(recipientPublicKey))
  const ct = fromBase64(sealed.ct)
  const tag = fromBase64(sealed.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct, 0)
  joined.set(tag, ct.length)
  try {
    return new TextDecoder().decode(
      await subtle().decrypt(
        {
          name: 'AES-GCM',
          iv: fromBase64(sealed.iv) as BufferSource,
          tagLength: 128,
        },
        key,
        joined as BufferSource
      )
    )
  } catch {
    throw new Error('The sealed value did not open with this key.')
  }
}

/** A non-extractable X25519 key from a PKCS8 private half, for {@link open}. */
export const importSealingKey = (pkcs8: Uint8Array): Promise<CryptoKey> =>
  subtle().importKey(
    'pkcs8',
    pkcs8 as BufferSource,
    { name: 'X25519' },
    false,
    ['deriveBits']
  )
