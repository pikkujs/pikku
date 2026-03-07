import type { SecretService } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import {
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'

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

    await this.db.schema
      .createTable('secrets')
      .ifNotExists()
      .addColumn('key', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('ciphertext', 'text', (col) => col.notNull())
      .addColumn('wrapped_dek', 'text', (col) => col.notNull())
      .addColumn('key_version', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    if (this.audit) {
      await this.db.schema
        .createTable('secrets_audit')
        .ifNotExists()
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('secret_key', 'varchar(255)', (col) => col.notNull())
        .addColumn('action', 'varchar(20)', (col) => col.notNull())
        .addColumn('performed_at', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .execute()
    }

    this.initialized = true
  }

  private async logAudit(
    secretKey: string,
    action: 'read' | 'write' | 'delete' | 'rotate'
  ): Promise<void> {
    if (!this.audit) return
    if (action === 'read' && !this.auditReads) return

    await this.db
      .insertInto('secrets_audit')
      .values({
        id: crypto.randomUUID(),
        secret_key: secretKey,
        action,
        performed_at: new Date().toISOString() as any,
      })
      .execute()
  }

  private getKEK(version: number): string {
    if (version === this.keyVersion) return this.key
    if (this.previousKey) return this.previousKey
    throw new Error(`No KEK available for key_version ${version}`)
  }

  async getSecret(key: string): Promise<string> {
    const row = await this.db
      .selectFrom('secrets')
      .select(['ciphertext', 'wrapped_dek', 'key_version'])
      .where('key', '=', key)
      .executeTakeFirst()

    if (!row) throw new Error(`Secret not found: ${key}`)

    const kek = this.getKEK(row.key_version)
    const result = await envelopeDecrypt<string>(
      kek,
      row.ciphertext,
      row.wrapped_dek
    )
    await this.logAudit(key, 'read')
    return result
  }

  async getSecretJSON<R = {}>(key: string): Promise<R> {
    const raw = await this.getSecret(key)
    return JSON.parse(raw) as R
  }

  async hasSecret(key: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('secrets')
      .select('key')
      .where('key', '=', key)
      .executeTakeFirst()
    return !!row
  }

  async setSecretJSON(key: string, value: unknown): Promise<void> {
    const plaintext = JSON.stringify(value)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      this.key,
      plaintext
    )
    const now = new Date().toISOString()

    await this.db
      .insertInto('secrets')
      .values({
        key,
        ciphertext,
        wrapped_dek: wrappedDEK,
        key_version: this.keyVersion,
        created_at: now as any,
        updated_at: now as any,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          ciphertext,
          wrapped_dek: wrappedDEK,
          key_version: this.keyVersion,
          updated_at: now as any,
        })
      )
      .execute()

    await this.logAudit(key, 'write')
  }

  async deleteSecret(key: string): Promise<void> {
    await this.db.deleteFrom('secrets').where('key', '=', key).execute()
    await this.logAudit(key, 'delete')
  }

  async rotateKEK(): Promise<number> {
    if (!this.previousKey) {
      throw new Error('No previousKey configured — nothing to rotate from')
    }

    const rows = await this.db
      .selectFrom('secrets')
      .select(['key', 'wrapped_dek'])
      .where('key_version', '<', this.keyVersion)
      .execute()

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(
        this.previousKey,
        this.key,
        row.wrapped_dek
      )
      await this.db
        .updateTable('secrets')
        .set({
          wrapped_dek: newWrappedDEK,
          key_version: this.keyVersion,
          updated_at: new Date().toISOString() as any,
        })
        .where('key', '=', row.key)
        .execute()

      await this.logAudit(row.key, 'rotate')
    }

    return rows.length
  }
}
