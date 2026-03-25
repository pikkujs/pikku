import type { CredentialService } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import {
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'

export interface KyselyCredentialServiceConfig {
  key: string
  keyVersion?: number
  previousKey?: string
  audit?: boolean
  auditReads?: boolean
}

export class KyselyCredentialService implements CredentialService {
  private initialized = false
  private key: string
  private keyVersion: number
  private previousKey?: string
  private audit: boolean
  private auditReads: boolean

  constructor(
    private db: Kysely<KyselyPikkuDB>,
    config: KyselyCredentialServiceConfig
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
      .createTable('credentials')
      .ifNotExists()
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('user_id', 'varchar(255)')
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

    await sql`CREATE UNIQUE INDEX IF NOT EXISTS credentials_name_user_id_unique ON credentials (name, COALESCE(user_id, ''))`.execute(
      this.db
    )

    if (this.audit) {
      await this.db.schema
        .createTable('credentials_audit')
        .ifNotExists()
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('credential_name', 'varchar(255)', (col) => col.notNull())
        .addColumn('user_id', 'varchar(255)')
        .addColumn('action', 'varchar(20)', (col) => col.notNull())
        .addColumn('performed_at', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .execute()
    }

    this.initialized = true
  }

  private async logAudit(
    name: string,
    userId: string | undefined,
    action: 'read' | 'write' | 'delete' | 'rotate'
  ): Promise<void> {
    if (!this.audit) return
    if (action === 'read' && !this.auditReads) return

    await this.db
      .insertInto('credentialsAudit')
      .values({
        id: crypto.randomUUID(),
        credentialName: name,
        userId: userId ?? null,
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

  private whereUserId(qb: any, userId?: string) {
    return userId
      ? qb.where('userId', '=', userId)
      : qb.where('userId', 'is', null)
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    let qb = this.db
      .selectFrom('credentials')
      .select(['ciphertext', 'wrappedDek', 'keyVersion'])
      .where('name', '=', name)
    qb = this.whereUserId(qb, userId)

    const row = await qb.executeTakeFirst()
    if (!row) return null

    const kek = this.getKEK(row.keyVersion)
    const plaintext = await envelopeDecrypt<string>(
      kek,
      row.ciphertext,
      row.wrappedDek
    )
    await this.logAudit(name, userId, 'read')

    try {
      return JSON.parse(plaintext) as T
    } catch {
      throw new Error(`Credential '${name}' contains invalid data`)
    }
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    const plaintext = JSON.stringify(value)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      this.key,
      plaintext
    )
    const now = new Date().toISOString()
    const exists = await this.has(name, userId)

    if (exists) {
      let qb = this.db
        .updateTable('credentials')
        .set({
          ciphertext,
          wrappedDek: wrappedDEK,
          keyVersion: this.keyVersion,
          updatedAt: now as unknown as Date,
        })
        .where('name', '=', name)
      qb = this.whereUserId(qb, userId)
      await qb.execute()
    } else {
      await this.db
        .insertInto('credentials')
        .values({
          name,
          userId: userId ?? null,
          ciphertext,
          wrappedDek: wrappedDEK,
          keyVersion: this.keyVersion,
          createdAt: now as unknown as Date,
          updatedAt: now as unknown as Date,
        })
        .execute()
    }

    await this.logAudit(name, userId, 'write')
  }

  async delete(name: string, userId?: string): Promise<void> {
    let qb = this.db.deleteFrom('credentials').where('name', '=', name)
    qb = this.whereUserId(qb, userId)
    await qb.execute()

    await this.logAudit(name, userId, 'delete')
  }

  async has(name: string, userId?: string): Promise<boolean> {
    let qb = this.db
      .selectFrom('credentials')
      .select('name')
      .where('name', '=', name)
    qb = this.whereUserId(qb, userId)

    const row = await qb.executeTakeFirst()
    return !!row
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.db
      .selectFrom('credentials')
      .select(['name', 'ciphertext', 'wrappedDek', 'keyVersion'])
      .where('userId', '=', userId)
      .execute()

    const result: Record<string, unknown> = {}
    for (const row of rows) {
      const kek = this.getKEK(row.keyVersion)
      const plaintext = await envelopeDecrypt<string>(
        kek,
        row.ciphertext,
        row.wrappedDek
      )
      try {
        result[row.name] = JSON.parse(plaintext)
      } catch {
        throw new Error(`Credential '${row.name}' contains invalid data`)
      }
      await this.logAudit(row.name, userId, 'read')
    }

    return result
  }

  async getUsersWithCredential(name: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('credentials')
      .select('userId')
      .where('name', '=', name)
      .where('userId', 'is not', null)
      .execute()

    return rows.map((row) => row.userId!).filter(Boolean)
  }

  async getAllUsers(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('credentials')
      .select('userId')
      .distinct()
      .where('userId', 'is not', null)
      .execute()

    return rows.map((row) => row.userId!).filter(Boolean)
  }

  async rotateKEK(): Promise<number> {
    if (!this.previousKey) {
      throw new Error('No previousKey configured — nothing to rotate from')
    }

    const rows = await this.db
      .selectFrom('credentials')
      .select(['name', 'userId', 'wrappedDek'])
      .where('keyVersion', '<', this.keyVersion)
      .execute()

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(
        this.previousKey,
        this.key,
        row.wrappedDek
      )
      let qb = this.db
        .updateTable('credentials')
        .set({
          wrappedDek: newWrappedDEK,
          keyVersion: this.keyVersion,
          updatedAt: new Date().toISOString() as unknown as Date,
        })
        .where('name', '=', row.name)
      qb = this.whereUserId(qb, row.userId ?? undefined)
      await qb.execute()

      await this.logAudit(row.name, row.userId ?? undefined, 'rotate')
    }

    return rows.length
  }
}
