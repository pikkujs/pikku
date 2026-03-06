import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  encryptJSON,
  decryptJSON,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from './crypto-utils.js'

describe('encryptJSON / decryptJSON', () => {
  const secret = 'test-secret-key-for-encryption'

  test('should round-trip a simple object', async () => {
    const original = { hello: 'world', num: 42 }
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })

  test('should round-trip a string value', async () => {
    const original = 'just a string'
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.strictEqual(decrypted, original)
  })

  test('should round-trip a number', async () => {
    const original = 12345
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.strictEqual(decrypted, original)
  })

  test('should round-trip null', async () => {
    const encrypted = await encryptJSON(secret, null)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.strictEqual(decrypted, null)
  })

  test('should round-trip a boolean', async () => {
    const encrypted = await encryptJSON(secret, true)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.strictEqual(decrypted, true)
  })

  test('should round-trip a nested object', async () => {
    const original = { user: { id: 1, roles: ['admin', 'user'] }, active: true }
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })

  test('should round-trip an array', async () => {
    const original = [1, 'two', { three: 3 }]
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })

  test('should produce different ciphertexts for same input (random IV)', async () => {
    const value = { same: 'data' }
    const enc1 = await encryptJSON(secret, value)
    const enc2 = await encryptJSON(secret, value)
    assert.notStrictEqual(enc1, enc2)
  })

  test('should produce a base64url string (no +, /, or = characters)', async () => {
    const encrypted = await encryptJSON(secret, { test: 'base64url' })
    assert.ok(!/[+/=]/.test(encrypted), `Expected base64url, got: ${encrypted}`)
  })

  test('should fail to decrypt with wrong secret', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    await assert.rejects(
      () => decryptJSON('wrong-secret', encrypted),
      (err: any) => err instanceof Error
    )
  })

  test('should reject an invalid encrypted payload (too short)', async () => {
    await assert.rejects(() => decryptJSON(secret, 'dG9vc2hvcnQ'), {
      message: 'Invalid encrypted payload',
    })
  })

  test('should reject empty string', async () => {
    await assert.rejects(() => decryptJSON(secret, ''), {
      message: 'Invalid encrypted payload',
    })
  })

  test('should reject corrupted ciphertext', async () => {
    const encrypted = await encryptJSON(secret, { data: 'test' })
    const corrupted = encrypted.slice(0, -4) + 'XXXX'
    await assert.rejects(
      () => decryptJSON(secret, corrupted),
      (err: any) => err instanceof Error
    )
  })

  test('should handle unicode content', async () => {
    const original = { emoji: '🎉', japanese: 'こんにちは', arabic: 'مرحبا' }
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })

  test('should handle empty object', async () => {
    const original = {}
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })

  test('should handle large payload', async () => {
    const original = { data: 'x'.repeat(10000) }
    const encrypted = await encryptJSON(secret, original)
    const decrypted = await decryptJSON(secret, encrypted)
    assert.deepStrictEqual(decrypted, original)
  })
})

describe('envelope encryption', () => {
  const kek = 'my-key-encryption-key'

  test('generateDEK produces unique keys', async () => {
    const dek1 = await generateDEK()
    const dek2 = await generateDEK()
    assert.notStrictEqual(dek1, dek2)
    assert.ok(dek1.length > 0)
  })

  test('wrapDEK / unwrapDEK round-trip', async () => {
    const dek = await generateDEK()
    const wrapped = await wrapDEK(kek, dek)
    const unwrapped = await unwrapDEK(kek, wrapped)
    assert.strictEqual(unwrapped, dek)
  })

  test('unwrapDEK fails with wrong KEK', async () => {
    const dek = await generateDEK()
    const wrapped = await wrapDEK(kek, dek)
    await assert.rejects(
      () => unwrapDEK('wrong-kek', wrapped),
      (err: any) => err instanceof Error
    )
  })

  test('envelopeEncrypt / envelopeDecrypt round-trip', async () => {
    const original = {
      apiKey: 'sk-secret-123',
      endpoint: 'https://api.example.com',
    }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)
    const decrypted = await envelopeDecrypt(kek, ciphertext, wrappedDEK)
    assert.deepStrictEqual(decrypted, original)
  })

  test('envelopeEncrypt produces unique ciphertexts and DEKs per call', async () => {
    const value = { same: 'data' }
    const r1 = await envelopeEncrypt(kek, value)
    const r2 = await envelopeEncrypt(kek, value)
    assert.notStrictEqual(r1.ciphertext, r2.ciphertext)
    assert.notStrictEqual(r1.wrappedDEK, r2.wrappedDEK)
  })

  test('envelopeDecrypt fails with wrong KEK', async () => {
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, 'secret')
    await assert.rejects(
      () => envelopeDecrypt('wrong-kek', ciphertext, wrappedDEK),
      (err: any) => err instanceof Error
    )
  })

  test('envelopeRewrap allows decryption with new KEK', async () => {
    const newKEK = 'my-new-kek'
    const original = { token: 'abc-123' }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)

    const rewrapped = await envelopeRewrap(kek, newKEK, wrappedDEK)

    await assert.rejects(
      () => envelopeDecrypt(kek, ciphertext, rewrapped),
      (err: any) => err instanceof Error
    )

    const decrypted = await envelopeDecrypt(newKEK, ciphertext, rewrapped)
    assert.deepStrictEqual(decrypted, original)
  })

  test('envelopeRewrap does not change the ciphertext', async () => {
    const original = { data: 'important' }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)
    const rewrapped = await envelopeRewrap(kek, 'new-kek', wrappedDEK)

    assert.notStrictEqual(rewrapped, wrappedDEK)

    const decrypted = await envelopeDecrypt('new-kek', ciphertext, rewrapped)
    assert.deepStrictEqual(decrypted, original)
  })

  test('envelope handles string secrets', async () => {
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      kek,
      'plain-string-secret'
    )
    const decrypted = await envelopeDecrypt<string>(kek, ciphertext, wrappedDEK)
    assert.strictEqual(decrypted, 'plain-string-secret')
  })
})
