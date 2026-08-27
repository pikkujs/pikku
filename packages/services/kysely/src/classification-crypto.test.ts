import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKEK, generateKEKSalt } from '@pikku/core/crypto-utils'
import { DataLock } from '@pikku/core/classification'
import { DataLockedError, InvalidPassphraseError } from '@pikku/core/errors'
import {
  ClassificationCrypto,
  DEFAULT_KEY_ID,
  createDataLockResolver,
  createMemoryLockVault,
  isColumnEnvelope,
  parseColumnEnvelope,
} from './classification-crypto.js'

const passphrase = 'a-passphrase-long-enough-to-be-real-key-material'

/** Every keyId the manifest under test names — `getKEK` only knows registered ones. */
const KEY_IDS = [DEFAULT_KEY_ID, 'credentials', 'notes', 'tenant.42']

const unlockedLock = async (
  secret = passphrase,
  keyIds = KEY_IDS
): Promise<DataLock> => {
  const lock = new DataLock(createMemoryLockVault())
  await lock.init()
  await lock.initialize(secret, keyIds)
  return lock
}

const staticCrypto = async () =>
  new ClassificationCrypto({
    resolveKEK: createDataLockResolver(await unlockedLock()),
  })

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
    const resolve = createDataLockResolver(await unlockedLock())
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

  test('the same keyId resolves to the same KEK, so unlock is paid once', async () => {
    const resolve = createDataLockResolver(await unlockedLock())
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

describe('locking', () => {
  /** A lock whose records exist but whose keys have not been handed over yet. */
  const lockedLock = async (): Promise<DataLock> => {
    const lock = await unlockedLock()
    lock.lock()
    return lock
  }

  test('a locked store refuses to resolve, identifiably', async () => {
    const resolve = createDataLockResolver(await lockedLock())
    await assert.rejects(
      () => resolve(DEFAULT_KEY_ID),
      (error: unknown) => error instanceof DataLockedError
    )
  })

  test('encrypting while locked refuses rather than writing plaintext', async () => {
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(await lockedLock()),
    })
    await assert.rejects(
      () => crypto.encryptColumn(DEFAULT_KEY_ID, 'ssn'),
      (error: unknown) => error instanceof DataLockedError
    )
  })

  test('a key that arrives after construction still opens the column', async () => {
    const lock = new DataLock(createMemoryLockVault())
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(lock),
    })

    await lock.init()
    await lock.initialize(passphrase, KEY_IDS)

    const stored = await crypto.encryptColumn(DEFAULT_KEY_ID, 'secret')
    assert.equal(await crypto.decryptColumn(stored), 'secret')
  })

  test('locking again withdraws a key that was working a moment ago', async () => {
    const lock = await unlockedLock()
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(lock),
    })

    const stored = await crypto.encryptColumn(DEFAULT_KEY_ID, 'secret')
    assert.equal(await crypto.decryptColumn(stored), 'secret')

    lock.lock()
    await assert.rejects(
      () => crypto.decryptColumn(stored),
      (error: unknown) => error instanceof DataLockedError
    )
  })

  test('unlock, lock, unlock reads back what the first unlock wrote', async () => {
    const lock = await unlockedLock()
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(lock),
    })

    const stored = await crypto.encryptColumn(DEFAULT_KEY_ID, 'secret')
    lock.lock()
    await lock.unlock(passphrase)

    assert.equal(await crypto.decryptColumn(stored), 'secret')
  })

  test('a wrong passphrase is refused and leaves the store locked', async () => {
    const lock = await unlockedLock()
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(lock),
    })
    const stored = await crypto.encryptColumn(DEFAULT_KEY_ID, 'secret')

    lock.lock()
    await assert.rejects(
      () => lock.unlock('a-completely-different-passphrase-of-good-length'),
      (error: unknown) => error instanceof InvalidPassphraseError
    )

    await assert.rejects(
      () => crypto.decryptColumn(stored),
      (error: unknown) => error instanceof DataLockedError,
      'a rejected unlock must not leave half a keyring behind'
    )
  })

  test('a written value carries the version from its lock record', async () => {
    const lock = await unlockedLock()
    const crypto = new ClassificationCrypto({
      resolveKEK: createDataLockResolver(lock),
    })
    const stored = await crypto.encryptColumn('credentials', 'v')
    assert.equal(
      parseColumnEnvelope(stored)?.keyVersion,
      lock.getKeyVersion('credentials')
    )
  })
})
