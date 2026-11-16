import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDecipheriv,
  createHash,
  createPublicKey,
  createPrivateKey,
  diffieHellman,
  generateKeyPairSync,
} from 'node:crypto'
import { createJoseKeyCrypto } from '@pikku/jose/keys'

const crypto = createJoseKeyCrypto()
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

const lenPrefixed = (b: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(b.length)
  return Buffer.concat([len, b])
}

/**
 * The recipient's half, written out longhand from RFC 7516 and RFC 7518
 * section 4.6 (ECDH-ES with the Concat KDF, A256GCM) using only node:crypto,
 * so it does not share code with the sealing side. The CLI holds no private
 * key, so this is the only way to check what it sends is openable.
 */
function openAsCloudWould(privateKey: string, compact: string) {
  const [head, encryptedKey, iv, ct, tag] = compact.split('.') as [
    string,
    string,
    string,
    string,
    string,
  ]
  assert.equal(
    encryptedKey,
    '',
    'ECDH-ES direct agreement has no encrypted key'
  )
  const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'))
  assert.equal(header.alg, 'ECDH-ES')
  assert.equal(header.enc, 'A256GCM')
  const epk = createPublicKey({ key: header.epk, format: 'jwk' })
  const shared = diffieHellman({
    privateKey: createPrivateKey({
      key: Buffer.from(privateKey, 'base64'),
      type: 'pkcs8',
      format: 'der',
    }),
    publicKey: epk,
  })
  const keyBits = Buffer.alloc(4)
  keyBits.writeUInt32BE(256)
  const otherInfo = Buffer.concat([
    lenPrefixed(Buffer.from('A256GCM')),
    lenPrefixed(Buffer.alloc(0)),
    lenPrefixed(Buffer.from(header.apv, 'base64url')),
    keyBits,
  ])
  const counter = Buffer.alloc(4)
  counter.writeUInt32BE(1)
  const cek = createHash('sha256')
    .update(Buffer.concat([counter, shared, otherInfo]))
    .digest()
  const decipher = createDecipheriv(
    'aes-256-gcm',
    cek,
    Buffer.from(iv, 'base64url')
  )
  decipher.setAAD(Buffer.from(head, 'ascii'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ct, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

describe('cloud-cli sealing via @pikku/jose/keys, opened by an independent node:crypto recipient', () => {
  test('a sealed value opens with the recipient private key', async () => {
    const { publicKey, privateKey } = x25519Keypair()
    const sealed = await crypto.seal(
      publicKey,
      KEY_ID,
      'sk_live_51H8xQ2KzZ9vRtY7wPqL3mN'
    )
    assert.equal(
      openAsCloudWould(privateKey, sealed),
      'sk_live_51H8xQ2KzZ9vRtY7wPqL3mN'
    )
  })

  test('the envelope names its key id and binds the recipient', async () => {
    const { publicKey } = x25519Keypair()
    const sealed = await crypto.seal(publicKey, KEY_ID, 'v')
    const header = JSON.parse(
      Buffer.from(sealed.split('.')[0]!, 'base64url').toString('utf8')
    )
    assert.equal(header.kid, KEY_ID)
    assert.equal(
      header.apv,
      Buffer.from(publicKey, 'base64').toString('base64url')
    )
  })

  test('the plaintext appears nowhere in what gets sent', async () => {
    const { publicKey } = x25519Keypair()
    const wire = await crypto.seal(publicKey, KEY_ID, 'the-secret')
    assert.ok(!wire.includes('the-secret'))
  })

  test('another recipient cannot open it', async () => {
    const { publicKey } = x25519Keypair()
    const other = x25519Keypair()
    const sealed = await crypto.seal(publicKey, KEY_ID, 'the-secret')
    assert.throws(() => openAsCloudWould(other.privateKey, sealed))
  })

  test('sealing the same value twice differs', async () => {
    const { publicKey } = x25519Keypair()
    const a = await crypto.seal(publicKey, KEY_ID, 'same')
    const b = await crypto.seal(publicKey, KEY_ID, 'same')
    assert.notEqual(a.split('.')[3], b.split('.')[3])
    assert.notEqual(a.split('.')[0], b.split('.')[0])
  })

  test('unicode and long values survive', async () => {
    const { publicKey, privateKey } = x25519Keypair()
    for (const value of ['—key–with–dashes—🔐', ' ', 'x'.repeat(4096)]) {
      assert.equal(
        openAsCloudWould(
          privateKey,
          await crypto.seal(publicKey, KEY_ID, value)
        ),
        value
      )
    }
  })

  test('a key of the wrong type is refused before anything is encrypted', async () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const spki = publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64')
    await assert.rejects(() => crypto.seal(spki, KEY_ID, 'v'), /./)
  })

  test('garbage in place of a key fails loudly', async () => {
    await assert.rejects(() => crypto.seal('not-a-key', KEY_ID, 'v'), /./)
  })
})
