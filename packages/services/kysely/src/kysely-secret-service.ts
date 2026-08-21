import {
  deriveKEK,
  envelopeDecrypt,
  envelopeEncrypt,
  envelopeRewrap,
  generateKEKSalt,
} from '@pikku/core/crypto-utils'
import { createSecretValue, isSecretValue } from '@pikku/core/classification'
import type { SecretService, SecretValues } from '@pikku/core/services'
import type { SecretValue } from '@pikku/core/classification'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { secretSchema } from './schema/secret.schema.js'

export interface KyselySecretServiceConfig {
  key: string
  keyVersion?: number
  previousKey?: string
  audit?: boolean
  auditReads?: boolean
}

export class KyselySecretService implements SecretService {
  private initialized = false
  private kekSalts = new Map<number, string>()
  private keks = new Map<number, CryptoKey>()
  private key: string
  private keyVersion: number
  private previousKey?: string
  private audit: boolean
  private auditReads: boolean

  constructor(
    private db: Kysely<KyselyPikkuDB>,
    config: KyselySecretServiceConfig
  ) {
    this.key = config.key
    this.keyVersion = config.keyVersion ?? 1
    this.previousKey = config.previousKey
    this.audit = config.audit ?? false
    this.auditReads = config.auditReads ?? false
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, secretSchema)
    this.initialized = true
  }

  private async logAudit(
    secretKey: string,
    action: 'read' | 'write' | 'delete' | 'rotate'
  ): Promise<void> {
    if (!this.audit) return
    if (action === 'read' && !this.auditReads) return

    await this.db
      .insertInto('secretsAudit')
      .values({
        id: crypto.randomUUID(),
        secretKey: secretKey,
        action,
        performedAt: new Date().toISOString() as unknown as Date,
      })
      .execute()
  }

  private async getKEKSalt(version: number): Promise<string> {
    const cached = this.kekSalts.get(version)
    if (cached) return cached

    const existing = await this.db
      .selectFrom('secretKekSalts')
      .select('salt')
      .where('keyVersion', '=', version)
      .executeTakeFirst()

    let salt = existing?.salt
    if (!salt) {
      await this.db
        .insertInto('secretKekSalts')
        .values({
          keyVersion: version,
          salt: generateKEKSalt(),
          createdAt: new Date().toISOString() as unknown as Date,
        })
        .onConflict((oc) => oc.column('keyVersion').doNothing())
        .execute()

      const row = await this.db
        .selectFrom('secretKekSalts')
        .select('salt')
        .where('keyVersion', '=', version)
        .executeTakeFirstOrThrow()
      salt = row.salt
    }

    this.kekSalts.set(version, salt)
    return salt
  }

  private async getKEK(version: number): Promise<CryptoKey> {
    const cached = this.keks.get(version)
    if (cached) return cached

    const passphrase = version === this.keyVersion ? this.key : this.previousKey
    if (!passphrase) {
      throw new Error(`No KEK available for key_version ${version}`)
    }

    const kek = await deriveKEK(passphrase, await this.getKEKSalt(version))
    this.keks.set(version, kek)
    return kek
  }

  async getSecret<T = string>(key: string): Promise<SecretValue<T>> {
    const row = await this.db
      .selectFrom('secrets')
      .select(['ciphertext', 'wrappedDek', 'keyVersion'])
      .where('key', '=', key)
      .executeTakeFirst()

    if (!row) throw new Error('Requested secret not found')

    const kek = await this.getKEK(row.keyVersion)
    const result = await envelopeDecrypt<T>(kek, row.ciphertext, row.wrappedDek)
    await this.logAudit(key, 'read')
    return createSecretValue(result)
  }

  async hasSecret(key: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('secrets')
      .select('key')
      .where('key', '=', key)
      .executeTakeFirst()
    return !!row
  }

  async setSecret(key: string, value: unknown): Promise<void> {
    // Encrypting the wrapper would store its redaction, not the secret —
    // writing a secret back to the vault is exactly what this method is for.
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      await this.getKEK(this.keyVersion),
      isSecretValue(value) ? value.reveal() : value
    )
    const now = new Date().toISOString()

    await this.db
      .insertInto('secrets')
      .values({
        key,
        ciphertext,
        wrappedDek: wrappedDEK,
        keyVersion: this.keyVersion,
        createdAt: now as unknown as Date,
        updatedAt: now as unknown as Date,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          ciphertext,
          wrappedDek: wrappedDEK,
          keyVersion: this.keyVersion,
          updatedAt: now as unknown as Date,
        })
      )
      .execute()

    await this.logAudit(key, 'write')
  }

  async deleteSecret(key: string): Promise<void> {
    await this.db.deleteFrom('secrets').where('key', '=', key).execute()
    await this.logAudit(key, 'delete')
  }

  async getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<SecretValues<T>>> {
    const rows = await this.db
      .selectFrom('secrets')
      .select(['key', 'ciphertext', 'wrappedDek', 'keyVersion'])
      .where('key', 'in', keys)
      .execute()

    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        const kek = await this.getKEK(row.keyVersion)
        out[row.key] = createSecretValue(
          await envelopeDecrypt(kek, row.ciphertext, row.wrappedDek)
        )
      } catch (cause) {
        // A stored secret that fails to decrypt is never expected — it means the
        // KEK does not match what the value was wrapped under (mismatched
        // PIKKU_SECRET_KEK, or a missing previousKey for an older key_version).
        // Swallowing it produces an undefined secret and an opaque downstream
        // failure (e.g. an auth "server configuration" 500). Fail loud, naming
        // the key and key_version so the misconfiguration is diagnosable.
        throw new Error(
          `Failed to decrypt secret "${row.key}" (key_version ${row.keyVersion}): ` +
            `the configured KEK does not match the key it was wrapped under`,
          { cause }
        )
      }
    }
    return out as Partial<SecretValues<T>>
  }

  async rotateKEK(): Promise<number> {
    if (!this.previousKey) {
      throw new Error('No previousKey configured — nothing to rotate from')
    }

    const rows = await this.db
      .selectFrom('secrets')
      .select(['key', 'wrappedDek'])
      .where('keyVersion', '<', this.keyVersion)
      .execute()

    const oldKEK = await this.getKEK(this.keyVersion - 1)
    const newKEK = await this.getKEK(this.keyVersion)

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(oldKEK, newKEK, row.wrappedDek)
      await this.db
        .updateTable('secrets')
        .set({
          wrappedDek: newWrappedDEK,
          keyVersion: this.keyVersion,
          updatedAt: new Date().toISOString() as unknown as Date,
        })
        .where('key', '=', row.key)
        .execute()

      await this.logAudit(row.key, 'rotate')
    }

    return rows.length
  }
}
