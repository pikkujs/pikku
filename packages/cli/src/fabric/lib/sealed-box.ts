/**
 * Sealing a value to a stage's public key, here on the client.
 *
 * `pikku fabric secrets set` seals before it sends, so the plaintext never
 * reaches fabric — not the ingress in front of it, not a request log, not the
 * process handling the write. Fabric stores the sealed blob and hands it to the
 * worker, which holds the only private key that opens it.
 *
 * This is the seal half of fabric's `sealed-x25519-v1`, and the two must stay
 * byte-compatible: an ephemeral X25519 keypair, ECDH against the recipient,
 * HKDF-SHA256 to a content key, AES-256-GCM to seal. Everything below is
 * `node:crypto` on purpose — a sealing primitive that pulled in a dependency
 * would be a supply-chain question sitting directly on the plaintext.
 *
 * There is deliberately no `unseal` here. The CLI has no private key and no
 * business having one; opening a value happens in the worker.
 */
import {
  createCipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

/** Algorithm tag carried by every sealed value. Must match fabric's. */
export const SEALED_BOX_ALGORITHM = 'sealed-x25519-v1'

/** HKDF domain separator. Must match fabric's byte for byte. */
const SEAL_SALT = 'pikkufabric/sealed-box/v1'

export interface SealedValue {
  alg: typeof SEALED_BOX_ALGORITHM
  /** The `encryption_key` row whose public key sealed this. */
  kid: string
  /** Ephemeral public key, SPKI DER as base64. */
  epk: string
  iv: string
  ct: string
  tag: string
}

/** Seal a value to a stage's public key. */
export function seal(
  publicKey: string,
  keyId: string,
  plaintext: string
): SealedValue {
  const recipient = importPublicKey(publicKey)
  const ephemeral = generateKeyPairSync('x25519')
  const epk = ephemeral.publicKey.export({ type: 'spki', format: 'der' })

  const contentKey = deriveContentKey(
    diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }),
    epk,
    recipient.export({ type: 'spki', format: 'der' })
  )

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', contentKey, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return {
    alg: SEALED_BOX_ALGORITHM,
    kid: keyId,
    epk: epk.toString('base64'),
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

/** Wire form. Fabric stores exactly this string. */
export function serializeSealedValue(sealed: SealedValue): string {
  return JSON.stringify(sealed)
}

/**
 * Both public keys go into the HKDF `info`, which is what stops a sealed value
 * being redirected: change either the ephemeral key or the recipient and the
 * derived content key changes with it.
 */
function deriveContentKey(
  shared: Buffer,
  epk: Buffer,
  recipientPublic: Buffer
): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      Buffer.from(SEAL_SALT),
      Buffer.concat([epk, recipientPublic]),
      32
    )
  )
}

function importPublicKey(publicKey: string) {
  let key
  try {
    key = createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      type: 'spki',
      format: 'der',
    })
  } catch (error) {
    throw new Error(
      `Not a valid X25519 public key (${error instanceof Error ? error.message : String(error)})`
    )
  }
  // A public key of the wrong curve would still ECDH, just against a key the
  // stage's worker cannot match — the failure would surface as an unopenable
  // secret much later, so refuse it at the point the type is still knowable.
  if (key.asymmetricKeyType !== 'x25519') {
    throw new Error(
      `Stage sealing key is ${key.asymmetricKeyType}, expected x25519 — this CLI is too old for it, run \`npm i -g @pikku/cli\``
    )
  }
  return key
}
