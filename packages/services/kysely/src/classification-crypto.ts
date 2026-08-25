import {
  envelopeDecrypt,
  envelopeEncrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'
import type { DataLock } from '@pikku/core/classification'
import type {
  LockRecord,
  LockVault,
  WrappedValue,
} from '@pikku/core/classification'

/**
 * The key a column is protected by when its classification names none. A
 * deployment that never scopes its keys stores this id in every row and still
 * gets the scoping seam for free.
 */
export const DEFAULT_KEY_ID = 'default'

const ENVELOPE_PREFIX = 'pikku1'

/** The parts of a stored envelope, as they came off the column. */
export interface ColumnEnvelope {
  keyId: string
  keyVersion: number
  wrappedDek: string
  ciphertext: string
}

/**
 * A KEK for one `keyId`, plus the version it was derived at.
 *
 * The version is the resolver's to report rather than the caller's to ask for:
 * on a write it stamps the row, and on a read the row already carries the
 * version the value was written under.
 */
export interface ResolvedKEK {
  kek: CryptoKey
  keyVersion: number
}

/**
 * Maps a `keyId` — and, when reading, the version the row was written under —
 * to the KEK that opens it.
 *
 * This is the seam the whole design turns on. An unlock gate, a per-tenant
 * lookup or a KMS call all replace this one function without reshaping anything
 * that calls it.
 */
export type KEKResolver = (
  keyId: string,
  keyVersion?: number
) => Promise<ResolvedKEK>

const encodePart = (value: string): string =>
  Buffer.from(value, 'utf8').toString('base64url')

const decodePart = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8')

const serializeEnvelope = (envelope: ColumnEnvelope): WrappedValue =>
  [
    ENVELOPE_PREFIX,
    encodePart(envelope.keyId),
    String(envelope.keyVersion),
    envelope.wrappedDek,
    envelope.ciphertext,
  ].join('.') as WrappedValue

/**
 * Read a stored envelope, or null when the value is not one.
 *
 * Every part is base64url except the version, so `.` cannot occur inside a part
 * and a fixed split is unambiguous — a `keyId` may contain dots.
 */
export const parseColumnEnvelope = (value: unknown): ColumnEnvelope | null => {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 5 || parts[0] !== ENVELOPE_PREFIX) return null

  const [, encodedKeyId, rawVersion, wrappedDek, ciphertext] = parts
  const keyVersion = Number(rawVersion)
  if (!Number.isInteger(keyVersion) || !wrappedDek || !ciphertext) return null

  try {
    return {
      keyId: decodePart(encodedKeyId!),
      keyVersion,
      wrappedDek,
      ciphertext,
    }
  } catch {
    return null
  }
}

export const isColumnEnvelope = (value: unknown): boolean =>
  parseColumnEnvelope(value) !== null

export interface ClassificationCryptoOptions {
  resolveKEK: KEKResolver
}

/**
 * Envelope encryption for a single classified column.
 *
 * Unlike `KyselySecretService`, which owns its table and can afford a column
 * per envelope part, a classified column is one column in someone else's table.
 * So the envelope is self-describing: the `keyId` and `keyVersion` travel in
 * the value, which is what lets a row record the key that protects it without
 * a schema change to every table that has a secret in it.
 */
export class ClassificationCrypto {
  private readonly resolveKEK: KEKResolver

  constructor(options: ClassificationCryptoOptions) {
    this.resolveKEK = options.resolveKEK
  }

  async encryptColumn(keyId: string, value: unknown): Promise<WrappedValue> {
    const { kek, keyVersion } = await this.resolveKEK(keyId)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, value)
    return serializeEnvelope({
      keyId,
      keyVersion,
      wrappedDek: wrappedDEK,
      ciphertext,
    })
  }

  async decryptColumn<T = unknown>(value: unknown): Promise<T> {
    const envelope = parseColumnEnvelope(value)
    if (!envelope) {
      throw new Error('Value is not a pikku column envelope')
    }
    const { kek } = await this.resolveKEK(envelope.keyId, envelope.keyVersion)
    return envelopeDecrypt<T>(kek, envelope.ciphertext, envelope.wrappedDek)
  }

  /**
   * Move a value to another key by re-wrapping its DEK. The ciphertext is
   * untouched, so the cost is a constant per row rather than proportional to
   * the value — the property that makes rescoping and rotation affordable.
   */
  async rewrapColumn(value: unknown, newKeyId: string): Promise<WrappedValue> {
    const envelope = parseColumnEnvelope(value)
    if (!envelope) {
      throw new Error('Value is not a pikku column envelope')
    }
    const { kek: oldKEK } = await this.resolveKEK(
      envelope.keyId,
      envelope.keyVersion
    )
    const { kek: newKEK, keyVersion } = await this.resolveKEK(newKeyId)
    return serializeEnvelope({
      keyId: newKeyId,
      keyVersion,
      wrappedDek: await envelopeRewrap(oldKEK, newKEK, envelope.wrappedDek),
      ciphertext: envelope.ciphertext,
    })
  }
}

/**
 * Resolve a column's KEK from a `DataLock`.
 *
 * The lock is asked per operation rather than read once, which is what lets the
 * key arrive after everything around it has been built: the server boots
 * locked, the passphrase comes in over HTTP, and none of the services, the
 * Kysely instance or the plugin are reconstructed. `getKEK` throws
 * `DataLockedError` while locked, so a classified write fails loudly instead of
 * quietly storing plaintext, and a later `lock()` takes the key back mid-life.
 */
export const createDataLockResolver =
  (lock: DataLock): KEKResolver =>
  async (keyId) => ({
    kek: await lock.getKEK(keyId),
    keyVersion: lock.getKeyVersion(keyId),
  })

/**
 * Lock records held in memory for the life of the process.
 *
 * The records are not secret — they are salts and a verifier — so what makes
 * this in-memory store a test-only choice is durability, not exposure: the
 * salts vanish on exit and every row sealed under them becomes unopenable. A
 * real deployment persists them.
 */
export const createMemoryLockVault = (): LockVault => {
  let records: LockRecord[] = []
  return {
    async read() {
      return records
    },
    async write(next) {
      records = next
    },
  }
}
