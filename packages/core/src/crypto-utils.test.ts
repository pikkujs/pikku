import { describe, test } from 'node:test'
import assert from 'node:assert'
import { encryptJSON, decryptJSON } from './crypto-utils.js'

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
