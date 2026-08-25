import {
  deriveKEK,
  generateDEK,
  generateKEKSalt,
  unwrapDEK,
  wrapDEK,
} from '../crypto-utils.js'
import {
  DataLockedError,
  InvalidPassphraseError,
  TooManyAttemptsError,
} from '../errors/errors.js'
import type { WrappedValue } from './data-classification.js'
import { DEFAULT_KEY_ID } from './key-ids.js'

export type LockState = 'uninitialized' | 'locked' | 'unlocked'

/**
 * One KEK's stored material: everything a passphrase has to reproduce, and
 * nothing a passphrase could be recovered from.
 */
export type LockRecord = {
  keyId: string
  keyVersion: number
  salt: string
  /**
   * A DEK sealed under this KEK. Unwrapping it is the passphrase check — AES-GCM
   * fails its authentication tag under the wrong key, so a bad passphrase is
   * caught before it can produce a single garbled row.
   */
  verifier: WrappedValue
}

/**
 * Where lock records live.
 *
 * Necessarily readable while locked — a store that needed its own key to find
 * out how to unlock itself could never be opened. It holds no plaintext key
 * material, so this costs nothing.
 */
export interface LockVault {
  read(): Promise<LockRecord[]>
  write(records: LockRecord[]): Promise<void>
}

/** Wrong guesses tolerated before a lockout window opens. */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000
const MAX_LOCKOUT_MS = 15 * 60_000

/**
 * The gate in front of every classified column.
 *
 * A key is never held at construction: the server boots locked and serves the
 * unlock screen, so the passphrase arrives over HTTP long after services are
 * built. `getKEK` is what a Kysely classification resolver calls per operation,
 * and it throws rather than returning a falsy key — silently writing plaintext
 * into a column the manifest calls `wrapped` would look like a working app
 * while the data sat exposed.
 */
export class DataLock {
  private keks = new Map<string, CryptoKey>()
  private records: LockRecord[] = []
  private initialized = false
  private failures = 0
  private lockedOutUntil = 0
  private readonly now: () => number

  constructor(
    private readonly vault: LockVault,
    options: { now?: () => number } = {}
  ) {
    this.now = options.now ?? Date.now
  }

  get state(): LockState {
    if (!this.records.length) {
      return 'uninitialized'
    }
    return this.keks.size ? 'unlocked' : 'locked'
  }

  /**
   * How long before another guess will be looked at, or 0.
   *
   * Exposed so an unlock screen can show the wait instead of discovering it by
   * guessing again — a guess made during a lockout is itself a failure, and
   * extends the window it was trying to wait out.
   */
  get retryAfterMs(): number {
    return Math.max(0, this.lockedOutUntil - this.now())
  }

  /** Read what the store already has, so `state` can answer. */
  async init(): Promise<LockState> {
    this.records = await this.vault.read()
    this.initialized = true
    return this.state
  }

  /**
   * First run: mint a salt and verifier per key and leave the store open, since
   * whoever chose the passphrase a moment ago does not need to retype it.
   */
  async initialize(
    passphrase: string,
    keyIds: string[] = [DEFAULT_KEY_ID]
  ): Promise<void> {
    this.assertInitialized()
    if (this.records.length) {
      throw new Error(
        'This store is already initialized. Re-initializing would seal it under a new key while every existing row stayed sealed under the old one.'
      )
    }

    const records: LockRecord[] = []
    for (const keyId of keyIds) {
      const salt = generateKEKSalt()
      const kek = await deriveKEK(passphrase, salt)
      records.push({
        keyId,
        keyVersion: 1,
        salt,
        verifier: await wrapDEK(kek, await generateDEK()),
      })
      this.keks.set(keyId, kek)
    }

    await this.vault.write(records)
    this.records = records
  }

  async unlock(passphrase: string): Promise<void> {
    this.assertInitialized()

    if (this.now() < this.lockedOutUntil) {
      // A correct passphrase waits too. Exempting it would hand an attacker the
      // oracle the throttle exists to deny: a guess that behaves differently is
      // a guess that has been confirmed.
      throw new TooManyAttemptsError()
    }

    const opened = new Map<string, CryptoKey>()
    for (const record of this.records) {
      const kek = await deriveKEK(passphrase, record.salt)
      try {
        await unwrapDEK(kek, record.verifier)
      } catch {
        this.recordFailure()
        // Which record failed says which key the passphrase was not for, so the
        // whole attempt fails as one rather than naming it.
        throw new InvalidPassphraseError()
      }
      opened.set(record.keyId, kek)
    }

    this.failures = 0
    this.lockedOutUntil = 0
    this.keks = opened
  }

  lock(): void {
    this.keks.clear()
  }

  async getKEK(keyId: string): Promise<CryptoKey> {
    // A keyId nobody initialized is a configuration error, and saying "locked"
    // about it sends whoever reads that log hunting for a passphrase to a
    // store that is already open. `DataLockedError` means only the lock state.
    this.assertKnownKeyId(keyId)
    const kek = this.keks.get(keyId)
    if (!kek) {
      throw new DataLockedError()
    }
    return kek
  }

  /**
   * The version to stamp into a value written under `keyId`.
   *
   * Separate from `getKEK` because only a write has to ask: a stored value
   * carries the version it was sealed under, so a read already knows. Readable
   * while locked, since a version number is not key material.
   */
  getKeyVersion(keyId: string): number {
    this.assertKnownKeyId(keyId)
    return this.records.find((record) => record.keyId === keyId)!.keyVersion
  }

  private assertKnownKeyId(keyId: string): void {
    if (!this.records.some((record) => record.keyId === keyId)) {
      throw new Error(
        `No lock record for key "${keyId}" — every keyId a column names has to be passed to initialize(). Derive the list from the classification manifest with keyIdsFromManifest() so the two cannot drift.`
      )
    }
  }

  private recordFailure(): void {
    this.failures += 1
    if (this.failures < MAX_ATTEMPTS) {
      return
    }
    const escalation = this.failures - MAX_ATTEMPTS
    this.lockedOutUntil =
      this.now() + Math.min(LOCKOUT_MS * 2 ** escalation, MAX_LOCKOUT_MS)
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('DataLock.init() must run before the store is used')
    }
  }
}
