import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { unwrapDEK } from '../crypto-utils.js'
import {
  DataLockedError,
  InvalidPassphraseError,
  TooManyAttemptsError,
} from '../errors/errors.js'
import { DataLock, type LockRecord, type LockVault } from './data-lock.js'

class InMemoryLockVault implements LockVault {
  constructor(private records: LockRecord[] = []) {}

  async read(): Promise<LockRecord[]> {
    return this.records
  }

  async write(records: LockRecord[]): Promise<void> {
    this.records = records
  }
}

const PASSPHRASE = 'correct horse battery staple'

describe('DataLock', () => {
  let vault: InMemoryLockVault
  let lock: DataLock

  beforeEach(() => {
    vault = new InMemoryLockVault()
    lock = new DataLock(vault)
  })

  test('an empty vault has never been initialized', async () => {
    await lock.init()
    assert.equal(lock.state, 'uninitialized')
  })

  test('initializing mints a record and leaves the lock open', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)

    assert.equal(lock.state, 'unlocked')
    const records = await vault.read()
    assert.equal(records.length, 1)
    assert.equal(records[0]!.keyId, 'default')
  })

  test('a vault that already has records comes up locked', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)

    const reopened = new DataLock(vault)
    await reopened.init()
    assert.equal(reopened.state, 'locked')
  })

  test('a locked store refuses to hand out a key', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)

    const reopened = new DataLock(vault)
    await reopened.init()
    await assert.rejects(reopened.getKEK('default'), DataLockedError)
  })

  test('the right passphrase yields a key that unwraps the verifier', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)
    const [record] = await vault.read()

    const reopened = new DataLock(vault)
    await reopened.init()
    await reopened.unlock(PASSPHRASE)

    assert.equal(reopened.state, 'unlocked')
    const kek = await reopened.getKEK('default')
    // The verifier is a DEK wrapped under this KEK; unwrapping it is the proof
    // the derived key is the same one that sealed the store.
    assert.equal(typeof (await unwrapDEK(kek, record!.verifier)), 'string')
  })

  test('a wrong passphrase is refused and leaves the store locked', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)

    const reopened = new DataLock(vault)
    await reopened.init()
    await assert.rejects(reopened.unlock('hunter2'), InvalidPassphraseError)

    assert.equal(reopened.state, 'locked')
    await assert.rejects(reopened.getKEK('default'), DataLockedError)
  })

  test('locking withdraws a key that was already handed out', async () => {
    await lock.init()
    await lock.initialize(PASSPHRASE)
    assert.ok(await lock.getKEK('default'))

    lock.lock()

    assert.equal(lock.state, 'locked')
    await assert.rejects(lock.getKEK('default'), DataLockedError)
  })

  test('a store can be unlocked again after being locked', async () => {
    // The KEK cache must not outlive lock(), but locking must not destroy the
    // records either — a desktop app locks on sleep and unlocks on wake.
    await lock.init()
    await lock.initialize(PASSPHRASE)
    lock.lock()

    await lock.unlock(PASSPHRASE)

    assert.equal(lock.state, 'unlocked')
    assert.ok(await lock.getKEK('default'))
  })

  test('an unknown keyId is refused even when unlocked', async () => {
    // Named as a configuration error rather than a lock state. Answering
    // "locked" to a keyId that was never initialized sends whoever is reading
    // the log off to find a passphrase for a store that is already open.
    await lock.init()
    await lock.initialize(PASSPHRASE)

    await assert.rejects(lock.getKEK('nonexistent'), (error: Error) => {
      assert.ok(!(error instanceof DataLockedError))
      assert.match(error.message, /nonexistent/)
      return true
    })
  })

  test('separate keyIds get separate keys from one passphrase', async () => {
    // Per-record salts are what make this work: one thing you know, several
    // independent KEKs, so scoping later is a resolver change and not a
    // re-encryption of every row.
    await lock.init()
    await lock.initialize(PASSPHRASE, ['notes', 'credentials'])
    const records = await vault.read()

    const notes = await lock.getKEK('notes')
    const credentials = await lock.getKEK('credentials')
    const credentialsRecord = records.find((r) => r.keyId === 'credentials')!

    await assert.rejects(unwrapDEK(notes, credentialsRecord.verifier))
    assert.equal(
      typeof (await unwrapDEK(credentials, credentialsRecord.verifier)),
      'string'
    )
  })

  test('repeated wrong guesses are refused before the key is even derived', async () => {
    // PBKDF2 costs ~48ms, which alone allows ~20 guesses a second — enough to
    // walk a weak passphrase. The unlock endpoint cannot require auth (a session
    // may itself live in an encrypted column), so this is the only throttle.
    let now = 0
    const throttled = new DataLock(vault, { now: () => now })
    await throttled.init()
    await throttled.initialize(PASSPHRASE)
    throttled.lock()

    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(throttled.unlock('wrong'), InvalidPassphraseError)
    }

    await assert.rejects(throttled.unlock('wrong'), TooManyAttemptsError)
    // Even the correct passphrase waits out the lockout, or the throttle would
    // be a no-op against an attacker who guesses right on attempt six.
    await assert.rejects(throttled.unlock(PASSPHRASE), TooManyAttemptsError)
  })

  test('the lockout lifts once its window passes', async () => {
    let now = 0
    const throttled = new DataLock(vault, { now: () => now })
    await throttled.init()
    await throttled.initialize(PASSPHRASE)
    throttled.lock()

    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(throttled.unlock('wrong'), InvalidPassphraseError)
    }
    await assert.rejects(throttled.unlock(PASSPHRASE), TooManyAttemptsError)

    now += 60_000

    await throttled.unlock(PASSPHRASE)
    assert.equal(throttled.state, 'unlocked')
  })

  test('a success clears the failure count', async () => {
    let now = 0
    const throttled = new DataLock(vault, { now: () => now })
    await throttled.init()
    await throttled.initialize(PASSPHRASE)
    throttled.lock()

    for (let attempt = 0; attempt < 4; attempt++) {
      await assert.rejects(throttled.unlock('wrong'), InvalidPassphraseError)
    }
    await throttled.unlock(PASSPHRASE)
    throttled.lock()

    // Without a reset the very next miss would trip the lockout, so a user who
    // typos occasionally over a long session would be locked out of their own app.
    await assert.rejects(throttled.unlock('wrong'), InvalidPassphraseError)
  })

  test('initializing a store that already has records is refused', async () => {
    // Re-initializing would mint a fresh salt and verifier while every existing
    // row is still sealed under the old KEK — the data would be unreadable with
    // no error to say why.
    await lock.init()
    await lock.initialize(PASSPHRASE)

    await assert.rejects(lock.initialize('a different passphrase'))
  })
})
