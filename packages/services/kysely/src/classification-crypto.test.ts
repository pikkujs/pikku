import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKEK, generateKEKSalt } from '@pikku/core/crypto-utils'
import {
  ClassificationCrypto,
  DEFAULT_KEY_ID,
  isColumnEnvelope,
  parseColumnEnvelope,
  type KEKResolver,
} from './classification-crypto.js'

const passphrase = 'a-passphrase-long-enough-to-be-real-key-material'

/**
 * A resolver that derives a KEK per keyId and remembers it.
 *
 * Caching is the part under test as much as the derivation: `resolveKEK` is
 * called per operation, and a resolver that re-derived every time would pay
 * key stretching on every row.
 */
const testResolver = (): KEKResolver => {
  const keks = new Map<string, Promise<CryptoKey>>()
  return async (keyId) => {
    let kek = keks.get(keyId)
    if (!kek) {
      kek = deriveKEK(passphrase, generateKEKSalt())
      keks.set(keyId, kek)
    }
    return { kek: await kek, keyVersion: 1 }
  }
}

const staticCrypto = async () =>
  new ClassificationCrypto({ resolveKEK: testResolver() })

describe('column envelope', () => {
  test('round-trips a value through the default key', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn(DEFAULT_KEY_ID, 'hunter2')
    assert.equal(await crypto.decryptColumn(envelope), 'hunter2')
  })

  test('the stored envelope names the key that protects it', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn('credentials', 'shh')
    const parsed = parseColumnEnvelope(envelope)
    assert.equal(parsed?.keyId, 'credentials')
    assert.equal(parsed?.keyVersion, 1)
  })

  test('a value is not stored in the clear', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn(DEFAULT_KEY_ID, 'hunter2')
    assert.ok(!envelope.includes('hunter2'))
  })

  test('every value gets its own DEK', async () => {
    const crypto = await staticCrypto()
    const a = parseColumnEnvelope(
      await crypto.encryptColumn(DEFAULT_KEY_ID, 'same')
    )
    const b = parseColumnEnvelope(
      await crypto.encryptColumn(DEFAULT_KEY_ID, 'same')
    )
    assert.notEqual(a?.wrappedDek, b?.wrappedDek)
    assert.notEqual(a?.ciphertext, b?.ciphertext)
  })

  test('round-trips non-string values', async () => {
    const crypto = await staticCrypto()
    const value = { card: '4242', meta: [1, 2, 3] }
    const envelope = await crypto.encryptColumn(DEFAULT_KEY_ID, value)
    assert.deepEqual(await crypto.decryptColumn(envelope), value)
  })

  test('plaintext is not mistaken for an envelope', () => {
    assert.equal(isColumnEnvelope('hunter2'), false)
    assert.equal(isColumnEnvelope(''), false)
    assert.equal(parseColumnEnvelope('hunter2'), null)
  })

  test('a keyId containing the separator survives the round trip', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn('tenant.42', 'x')
    assert.equal(parseColumnEnvelope(envelope)?.keyId, 'tenant.42')
    assert.equal(await crypto.decryptColumn(envelope), 'x')
  })
})

describe('KEK scoping', () => {
  test('different keyIds derive different KEKs from one passphrase', async () => {
    const resolve = testResolver()
    const a = await resolve(DEFAULT_KEY_ID)
    const b = await resolve('credentials')
    assert.notEqual(a.kek, b.kek)
  })

  test('a value written under one keyId does not open under another', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn('credentials', 'shh')
    const forged = envelope.replace(
      /^(pikku1\.)[^.]+/,
      `$1${Buffer.from('notes').toString('base64url')}`
    )
    await assert.rejects(() => crypto.decryptColumn(forged))
  })

  test('the same keyId resolves to the same KEK, so derivation is paid once', async () => {
    const resolve = testResolver()
    assert.equal(
      (await resolve(DEFAULT_KEY_ID)).kek,
      (await resolve(DEFAULT_KEY_ID)).kek
    )
  })

  test('rewrapping moves a value to a new key without touching the ciphertext', async () => {
    const crypto = await staticCrypto()
    const envelope = await crypto.encryptColumn(DEFAULT_KEY_ID, 'portable')
    const before = parseColumnEnvelope(envelope)

    const rewrapped = await crypto.rewrapColumn(envelope, 'credentials')
    const after = parseColumnEnvelope(rewrapped)

    assert.equal(after?.keyId, 'credentials')
    assert.equal(
      after?.ciphertext,
      before?.ciphertext,
      'rewrap must re-wrap the DEK, not re-encrypt the value'
    )
    assert.notEqual(after?.wrappedDek, before?.wrappedDek)
    assert.equal(await crypto.decryptColumn(rewrapped), 'portable')
  })

  test('a resolver may hand back a KEK it derived any way it likes', async () => {
    const kek = await deriveKEK(passphrase, generateKEKSalt())
    const crypto = new ClassificationCrypto({
      resolveKEK: async () => ({ kek, keyVersion: 7 }),
    })
    const envelope = await crypto.encryptColumn('anything', 'v')
    assert.equal(parseColumnEnvelope(envelope)?.keyVersion, 7)
    assert.equal(await crypto.decryptColumn(envelope), 'v')
  })
})
