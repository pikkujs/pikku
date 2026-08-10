import { describe, test } from 'node:test'
import assert from 'node:assert'
import { WeakKeyMaterialError } from './errors/errors.js'
import {
  encryptJSON,
  decryptJSON,
  encryptWithKeyMaterial,
  decryptWithKeyMaterial,
  generateDEK,
  generateKEKSalt,
  deriveKEK,
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

describe('key derivation hardening', () => {
  const secret = 'test-secret-key-for-encryption'

  const SALT_BYTES = 16
  const IV_BYTES = 12
  const TAG_BYTES = 16

  const fromBase64Url = (input: string): Uint8Array => {
    let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4 !== 0) b64 += '='
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }

  const toBase64Url = (bytes: Uint8Array): string =>
    Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  test('the derived key is NOT the raw SHA-256 digest of the passphrase', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    const blob = fromBase64Url(encrypted)

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(secret)
    )
    const naiveKey = await crypto.subtle.importKey(
      'raw',
      digest,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    for (let ivStart = 0; ivStart <= SALT_BYTES; ivStart++) {
      const iv = blob.slice(ivStart, ivStart + IV_BYTES)
      const ciphertext = blob.slice(ivStart + IV_BYTES)
      if (ciphertext.length <= TAG_BYTES) continue
      await assert.rejects(
        () =>
          crypto.subtle.decrypt({ name: 'AES-GCM', iv }, naiveKey, ciphertext),
        `SHA-256(passphrase) decrypted the payload at offset ${ivStart}`
      )
    }
  })

  test('each encryption embeds a fresh random salt', async () => {
    const value = { same: 'data' }
    const salts = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const blob = fromBase64Url(await encryptJSON(secret, value))
      salts.add(Buffer.from(blob.slice(0, SALT_BYTES)).toString('hex'))
    }
    assert.strictEqual(salts.size, 8, 'salt repeated across encryptions')
  })

  test('blob layout is [salt:16][iv:12][ciphertext+tag]', async () => {
    const plaintext = JSON.stringify({ data: 'x'.repeat(100) })
    const blob = fromBase64Url(
      await encryptJSON(secret, { data: 'x'.repeat(100) })
    )
    assert.strictEqual(
      blob.length,
      SALT_BYTES + IV_BYTES + plaintext.length + TAG_BYTES
    )
  })

  test('round-trips under the salted format', async () => {
    const original = { user: 'alice', scopes: ['read', 'write'] }
    const encrypted = await encryptJSON(secret, original)
    assert.deepStrictEqual(await decryptJSON(secret, encrypted), original)
  })

  test('a wrong passphrase rejects rather than returning garbage', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    let result: unknown = Symbol('untouched')
    await assert.rejects(async () => {
      result = await decryptJSON('wrong-secret', encrypted)
    })
    assert.strictEqual(typeof result, 'symbol', 'decrypt returned a value')
  })

  test('a blob truncated into the salt is rejected', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    const blob = fromBase64Url(encrypted)
    const truncated = toBase64Url(blob.slice(0, SALT_BYTES - 1))
    await assert.rejects(() => decryptJSON(secret, truncated), {
      message: 'Invalid encrypted payload',
    })
  })

  test('a blob carrying salt+iv but no ciphertext is rejected', async () => {
    const header = toBase64Url(new Uint8Array(SALT_BYTES + IV_BYTES))
    await assert.rejects(() => decryptJSON(secret, header), {
      message: 'Invalid encrypted payload',
    })
  })

  test('tampering with the salt is rejected', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    const blob = fromBase64Url(encrypted)
    blob[0] = blob[0]! ^ 0xff
    await assert.rejects(() => decryptJSON(secret, toBase64Url(blob)))
  })

  test('tampering with the tag is rejected', async () => {
    const encrypted = await encryptJSON(secret, { data: 'sensitive' })
    const blob = fromBase64Url(encrypted)
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff
    await assert.rejects(() => decryptJSON(secret, toBase64Url(blob)))
  })
})

describe('encryptWithKeyMaterial / decryptWithKeyMaterial', () => {
  const NAME = 'PIKKU_REMOTE_SECRET'
  const keyMaterial = 'k'.repeat(43)
  const info = 'pikku:remote-session'

  const SALT_BYTES = 16
  const IV_BYTES = 12
  const TAG_BYTES = 16

  const fromBase64Url = (input: string): Uint8Array => {
    let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4 !== 0) b64 += '='
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }

  const toBase64Url = (bytes: Uint8Array): string =>
    Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  test('round-trips an object', async () => {
    const original = { user: 'alice', scopes: ['read', 'write'] }
    const encrypted = await encryptWithKeyMaterial(
      NAME,
      keyMaterial,
      info,
      original
    )
    assert.deepStrictEqual(
      await decryptWithKeyMaterial(NAME, keyMaterial, info, encrypted),
      original
    )
  })

  test('round-trips unicode content', async () => {
    const original = { emoji: '🎉', japanese: 'こんにちは' }
    const encrypted = await encryptWithKeyMaterial(
      NAME,
      keyMaterial,
      info,
      original
    )
    assert.deepStrictEqual(
      await decryptWithKeyMaterial(NAME, keyMaterial, info, encrypted),
      original
    )
  })

  test('blob layout is [salt:16][iv:12][ciphertext+tag]', async () => {
    const value = { data: 'x'.repeat(100) }
    const blob = fromBase64Url(
      await encryptWithKeyMaterial(NAME, keyMaterial, info, value)
    )
    assert.strictEqual(
      blob.length,
      SALT_BYTES + IV_BYTES + JSON.stringify(value).length + TAG_BYTES
    )
  })

  test('produces base64url with no +, / or = characters', async () => {
    const encrypted = await encryptWithKeyMaterial(NAME, keyMaterial, info, {
      test: 1,
    })
    assert.ok(!/[+/=]/.test(encrypted), `Expected base64url, got: ${encrypted}`)
  })

  test('each encryption embeds a fresh random salt', async () => {
    const salts = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const blob = fromBase64Url(
        await encryptWithKeyMaterial(NAME, keyMaterial, info, { same: 'data' })
      )
      salts.add(Buffer.from(blob.slice(0, SALT_BYTES)).toString('hex'))
    }
    assert.strictEqual(salts.size, 8, 'salt repeated across encryptions')
  })

  test('a wrong key material rejects rather than returning garbage', async () => {
    const encrypted = await encryptWithKeyMaterial(NAME, keyMaterial, info, {
      data: 'sensitive',
    })
    let result: unknown = Symbol('untouched')
    await assert.rejects(async () => {
      result = await decryptWithKeyMaterial(
        NAME,
        'w'.repeat(43),
        info,
        encrypted
      )
    })
    assert.strictEqual(typeof result, 'symbol', 'decrypt returned a value')
  })

  test('a key derived for one info cannot decrypt another info payload', async () => {
    const encrypted = await encryptWithKeyMaterial(
      NAME,
      keyMaterial,
      'pikku:remote-session',
      { data: 'sensitive' }
    )
    await assert.rejects(() =>
      decryptWithKeyMaterial(
        NAME,
        keyMaterial,
        'pikku:other-purpose',
        encrypted
      )
    )
  })

  test('info namespacing holds even for a one-character difference', async () => {
    const encrypted = await encryptWithKeyMaterial(NAME, keyMaterial, 'a', {
      data: 'x',
    })
    await assert.rejects(() =>
      decryptWithKeyMaterial(NAME, keyMaterial, 'b', encrypted)
    )
  })

  test('a blob truncated into the salt is rejected', async () => {
    const encrypted = await encryptWithKeyMaterial(NAME, keyMaterial, info, {
      data: 'sensitive',
    })
    const truncated = toBase64Url(
      fromBase64Url(encrypted).slice(0, SALT_BYTES - 1)
    )
    await assert.rejects(
      () => decryptWithKeyMaterial(NAME, keyMaterial, info, truncated),
      { message: 'Invalid encrypted payload' }
    )
  })

  test('a blob carrying salt+iv but no ciphertext is rejected', async () => {
    const header = toBase64Url(new Uint8Array(SALT_BYTES + IV_BYTES))
    await assert.rejects(
      () => decryptWithKeyMaterial(NAME, keyMaterial, info, header),
      { message: 'Invalid encrypted payload' }
    )
  })

  test('tampering with the salt is rejected', async () => {
    const blob = fromBase64Url(
      await encryptWithKeyMaterial(NAME, keyMaterial, info, {
        data: 'sensitive',
      })
    )
    blob[0] = blob[0]! ^ 0xff
    await assert.rejects(() =>
      decryptWithKeyMaterial(NAME, keyMaterial, info, toBase64Url(blob))
    )
  })

  test('tampering with the tag is rejected', async () => {
    const blob = fromBase64Url(
      await encryptWithKeyMaterial(NAME, keyMaterial, info, {
        data: 'sensitive',
      })
    )
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff
    await assert.rejects(() =>
      decryptWithKeyMaterial(NAME, keyMaterial, info, toBase64Url(blob))
    )
  })

  test('a passphrase blob cannot be read by the key-material path', async () => {
    const encrypted = await encryptJSON(keyMaterial, { data: 'sensitive' })
    await assert.rejects(() =>
      decryptWithKeyMaterial(NAME, keyMaterial, info, encrypted)
    )
  })

  test('rejects key material shorter than 32 characters on encrypt', async () => {
    await assert.rejects(
      () => encryptWithKeyMaterial(NAME, 'short-secret', info, { a: 1 }),
      (err: unknown) => err instanceof WeakKeyMaterialError
    )
  })

  test('rejects key material shorter than 32 characters on decrypt', async () => {
    const encrypted = await encryptWithKeyMaterial(NAME, keyMaterial, info, {
      a: 1,
    })
    await assert.rejects(
      () => decryptWithKeyMaterial(NAME, 'short-secret', info, encrypted),
      (err: unknown) => err instanceof WeakKeyMaterialError
    )
  })

  test('accepts key material of exactly 32 characters', async () => {
    const exact = 'y'.repeat(32)
    const encrypted = await encryptWithKeyMaterial(NAME, exact, info, { a: 1 })
    assert.deepStrictEqual(
      await decryptWithKeyMaterial(NAME, exact, info, encrypted),
      { a: 1 }
    )
  })

  test('the weak key material error names the offending secret', async () => {
    await assert.rejects(
      () => encryptWithKeyMaterial('MY_SECRET', 'tiny', info, { a: 1 }),
      (err: unknown) =>
        err instanceof WeakKeyMaterialError &&
        err.message.includes('MY_SECRET') &&
        err.message.includes('32')
    )
  })

  test('key derivation is fast enough for the per-request path', async () => {
    await encryptWithKeyMaterial(NAME, keyMaterial, info, { warm: true })

    const iterations = 20
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      const blob = await encryptWithKeyMaterial(NAME, keyMaterial, info, {
        i,
      })
      await decryptWithKeyMaterial(NAME, keyMaterial, info, blob)
    }
    const perPair = (performance.now() - start) / iterations

    assert.ok(
      perPair < 5,
      `encrypt+decrypt took ${perPair.toFixed(2)}ms, budget is 5ms`
    )
  })
})

describe('envelope encryption', () => {
  const passphrase = 'my-key-encryption-key'
  const salt = generateKEKSalt()

  test('generateDEK produces unique keys', async () => {
    const dek1 = await generateDEK()
    const dek2 = await generateDEK()
    assert.notStrictEqual(dek1, dek2)
    assert.ok(dek1.length > 0)
  })

  test('generateKEKSalt produces a unique base64url salt each call', () => {
    const salts = new Set<string>()
    for (let i = 0; i < 8; i++) salts.add(generateKEKSalt())
    assert.strictEqual(salts.size, 8)
    for (const value of salts) {
      assert.ok(!/[+/=]/.test(value), `Expected base64url, got: ${value}`)
    }
  })

  test('deriveKEK is deterministic for the same passphrase and salt', async () => {
    const kekA = await deriveKEK(passphrase, salt)
    const kekB = await deriveKEK(passphrase, salt)
    const wrapped = await wrapDEK(kekA, 'dek-value')
    assert.strictEqual(await unwrapDEK(kekB, wrapped), 'dek-value')
  })

  test('the same passphrase under a different salt yields a different KEK', async () => {
    const kekA = await deriveKEK(passphrase, salt)
    const kekB = await deriveKEK(passphrase, generateKEKSalt())
    const wrapped = await wrapDEK(kekA, 'dek-value')
    await assert.rejects(() => unwrapDEK(kekB, wrapped))
  })

  test('wrapDEK / unwrapDEK round-trip', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const dek = await generateDEK()
    const wrapped = await wrapDEK(kek, dek)
    assert.strictEqual(await unwrapDEK(kek, wrapped), dek)
  })

  test('the wrapped DEK blob layout is [iv:12][ciphertext+tag]', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const dek = await generateDEK()
    const wrapped = await wrapDEK(kek, dek)

    let b64 = wrapped.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4 !== 0) b64 += '='
    const blob = new Uint8Array(Buffer.from(b64, 'base64'))

    assert.strictEqual(blob.length, 12 + JSON.stringify(dek).length + 16)
  })

  test('unwrapDEK fails with a KEK derived from a wrong passphrase', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const wrongKEK = await deriveKEK('wrong-kek', salt)
    const wrapped = await wrapDEK(kek, await generateDEK())
    await assert.rejects(
      () => unwrapDEK(wrongKEK, wrapped),
      (err: any) => err instanceof Error
    )
  })

  test('a tampered wrapped DEK is rejected', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const wrapped = await wrapDEK(kek, await generateDEK())
    await assert.rejects(() => unwrapDEK(kek, wrapped.slice(0, -4) + 'XXXX'))
  })

  test('a truncated wrapped DEK is rejected', async () => {
    const kek = await deriveKEK(passphrase, salt)
    await assert.rejects(() => unwrapDEK(kek, 'dG9vc2hvcnQ'), {
      message: 'Invalid encrypted payload',
    })
  })

  test('envelopeEncrypt / envelopeDecrypt round-trip', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const original = {
      apiKey: 'sk-secret-123',
      endpoint: 'https://api.example.com',
    }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)
    assert.deepStrictEqual(
      await envelopeDecrypt(kek, ciphertext, wrappedDEK),
      original
    )
  })

  test('envelopeEncrypt produces unique ciphertexts and DEKs per call', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const value = { same: 'data' }
    const r1 = await envelopeEncrypt(kek, value)
    const r2 = await envelopeEncrypt(kek, value)
    assert.notStrictEqual(r1.ciphertext, r2.ciphertext)
    assert.notStrictEqual(r1.wrappedDEK, r2.wrappedDEK)
  })

  test('envelopeDecrypt fails with a wrong KEK', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const wrongKEK = await deriveKEK('wrong-kek', salt)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, 'secret')
    await assert.rejects(
      () => envelopeDecrypt(wrongKEK, ciphertext, wrappedDEK),
      (err: any) => err instanceof Error
    )
  })

  test('envelopeRewrap allows decryption with the new KEK', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const newSalt = generateKEKSalt()
    const newKEK = await deriveKEK('my-new-kek', newSalt)
    const original = { token: 'abc-123' }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)

    const rewrapped = await envelopeRewrap(kek, newKEK, wrappedDEK)

    await assert.rejects(
      () => envelopeDecrypt(kek, ciphertext, rewrapped),
      (err: any) => err instanceof Error
    )

    assert.deepStrictEqual(
      await envelopeDecrypt(newKEK, ciphertext, rewrapped),
      original
    )
  })

  test('envelopeRewrap does not change the ciphertext', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const newKEK = await deriveKEK('new-kek', generateKEKSalt())
    const original = { data: 'important' }
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, original)
    const rewrapped = await envelopeRewrap(kek, newKEK, wrappedDEK)

    assert.notStrictEqual(rewrapped, wrappedDEK)
    assert.deepStrictEqual(
      await envelopeDecrypt(newKEK, ciphertext, rewrapped),
      original
    )
  })

  test('envelope handles string secrets', async () => {
    const kek = await deriveKEK(passphrase, salt)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      kek,
      'plain-string-secret'
    )
    assert.strictEqual(
      await envelopeDecrypt<string>(kek, ciphertext, wrappedDEK),
      'plain-string-secret'
    )
  })

  /**
   * Timed against a derivation measured here rather than a fixed millisecond
   * budget. A constant threshold is a load test in disguise: this runs
   * alongside two thousand other tests, and 50ms left barely 4x headroom over
   * a 10ms window, so the suite went red roughly one run in five. Timing the
   * derivation the test already needs costs nothing and makes both sides scale
   * together, so the margin survives whatever else the machine is doing.
   *
   * knowledge: decisions/internals/a-wall-clock-threshold-is-a-load-test-in-disguise.md
   */
  test('N secrets cost one KEK derivation, not N', async () => {
    const derivationStart = performance.now()
    const kek = await deriveKEK(passphrase, salt)
    const oneDerivation = performance.now() - derivationStart

    const count = 50
    const stored = []
    for (let i = 0; i < count; i++) {
      stored.push(await envelopeEncrypt(kek, { index: i }))
    }

    const start = performance.now()
    for (let i = 0; i < count; i++) {
      const { ciphertext, wrappedDEK } = stored[i]!
      assert.deepStrictEqual(
        await envelopeDecrypt(kek, ciphertext, wrappedDEK),
        {
          index: i,
        }
      )
    }
    const elapsed = performance.now() - start

    assert.ok(
      elapsed < oneDerivation,
      `unwrapping ${count} DEKs took ${elapsed.toFixed(1)}ms, longer than the ${oneDerivation.toFixed(1)}ms a single KEK derivation costs — re-deriving per secret would cost about ${(oneDerivation * count).toFixed(0)}ms`
    )
  })
})
