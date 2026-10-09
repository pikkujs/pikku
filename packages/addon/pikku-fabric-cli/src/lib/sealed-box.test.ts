import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto'
import {
  seal,
  serializeSealedValue,
  SEALED_BOX_ALGORITHM,
} from './sealed-box.js'

const KEY_ID = '9c1d7f30-4b62-4a1e-9d55-6f0e2a8b3c47'

function x25519Keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  return {
    publicKey: publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64'),
    privateKey: privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64'),
  }
}

/**
 * The recipient's half, written out longhand rather than imported.
 *
 * This module deliberately ships no `unseal` — the CLI holds no private key —
 * so the only way to check that `seal` produces something openable is to open
 * it here from the spec: HKDF-SHA256 over the ECDH secret, salt
 * `pikkufabric/sealed-box/v1`, info `epk || recipientPublicKey`, AES-256-GCM.
 * Fabric's worker-side implementation follows the same recipe; if this stops
 * matching, so has that.
 */
function openAsFabricWould(
  privateKey: string,
  sealed: ReturnType<typeof seal>
) {
  const recipientPrivate = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    type: 'pkcs8',
    format: 'der',
  })
  const epk = Buffer.from(sealed.epk, 'base64')
  const shared = diffieHellman({
    privateKey: recipientPrivate,
    publicKey: createPublicKey({ key: epk, type: 'spki', format: 'der' }),
  })
  const contentKey = Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      Buffer.from('pikkufabric/sealed-box/v1'),
      Buffer.concat([
        epk,
        createPublicKey(recipientPrivate).export({
          type: 'spki',
          format: 'der',
        }),
      ]),
      32
    )
  )
  const decipher = createDecipheriv(
    'aes-256-gcm',
    contentKey,
    Buffer.from(sealed.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

describe('sealed-box (client side)', () => {
  test('a sealed value opens with the recipient private key', () => {
    const { publicKey, privateKey } = x25519Keypair()
    const sealed = seal(publicKey, KEY_ID, 'sk_live_51H8xQ2KzZ9vRtY7wPqL3mN')
    assert.equal(
      openAsFabricWould(privateKey, sealed),
      'sk_live_51H8xQ2KzZ9vRtY7wPqL3mN'
    )
  })

  test('the envelope carries the algorithm tag and key id', () => {
    const { publicKey } = x25519Keypair()
    const sealed = seal(publicKey, KEY_ID, 'v')
    assert.equal(sealed.alg, SEALED_BOX_ALGORITHM)
    assert.equal(sealed.kid, KEY_ID)
    for (const field of ['epk', 'iv', 'ct', 'tag'] as const) {
      assert.equal(typeof sealed[field], 'string')
      assert.ok(sealed[field].length > 0, `${field} is empty`)
    }
  })

  test('the plaintext appears nowhere in what gets sent', () => {
    const { publicKey } = x25519Keypair()
    const wire = serializeSealedValue(seal(publicKey, KEY_ID, 'the-secret'))
    assert.ok(!wire.includes('the-secret'))
  })

  test('another recipient cannot open it', () => {
    const { publicKey } = x25519Keypair()
    const other = x25519Keypair()
    const sealed = seal(publicKey, KEY_ID, 'the-secret')
    assert.throws(() => openAsFabricWould(other.privateKey, sealed))
  })

  test('sealing the same value twice differs', () => {
    // Otherwise identical ciphertexts would reveal that two stages, or two
    // names, hold the same secret.
    const { publicKey } = x25519Keypair()
    const a = seal(publicKey, KEY_ID, 'same')
    const b = seal(publicKey, KEY_ID, 'same')
    assert.notEqual(a.ct, b.ct)
    assert.notEqual(a.epk, b.epk)
    assert.notEqual(a.iv, b.iv)
  })

  test('unicode and long values survive', () => {
    const { publicKey, privateKey } = x25519Keypair()
    for (const value of ['—key–with–dashes—🔐', ' ', 'x'.repeat(4096)]) {
      assert.equal(
        openAsFabricWould(privateKey, seal(publicKey, KEY_ID, value)),
        value
      )
    }
  })

  test('a key of the wrong type is refused before anything is encrypted', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const spki = publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64')
    assert.throws(() => seal(spki, KEY_ID, 'v'), /expected x25519/)
  })

  test('garbage in place of a key fails loudly', () => {
    assert.throws(() => seal('not-a-key', KEY_ID, 'v'), /X25519 public key/)
  })
})
