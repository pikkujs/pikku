import type { SecretService } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import {
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'
import { ensurePikkuSchema } from './schema/index.js'
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
    await ensurePikkuSchema(this.db, secretSchema)
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

  private getKEK(version: number): string {
    if (version === this.keyVersion) return this.key
    if (this.previousKey) return this.previousKey
    throw new Error(`No KEK available for key_version ${version}`)
  }

  async getSecret<T = string>(key: string): Promise<T> {
    const row = await this.db
      .selectFrom('secrets')
      .select(['ciphertext', 'wrappedDek', 'keyVersion'])
      .where('key', '=', key)
      .executeTakeFirst()

    if (!row) throw new Error('Requested secret not found')

    const kek = this.getKEK(row.keyVersion)
    const result = await envelopeDecrypt<T>(kek, row.ciphertext, row.wrappedDek)
    await this.logAudit(key, 'read')
    return result
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
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(this.key, value)
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
  ): Promise<T> {
    const rows = await this.db
      .selectFrom('secrets')
      .select(['key', 'ciphertext', 'wrappedDek', 'keyVersion'])
      .where('key', 'in', keys)
      .execute()

    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        const kek = this.getKEK(row.keyVersion)
        out[row.key] = await envelopeDecrypt(
          kek,
          row.ciphertext,
          row.wrappedDek
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
    return out as T
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

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(
        this.previousKey,
        this.key,
        row.wrappedDek
      )
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
