import type { SecretService } from '@pikku/core/services'
import type { Db, Collection } from 'mongodb'
import {
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'

export interface MongoDBSecretServiceConfig {
  key: string
  keyVersion?: number
  previousKey?: string
  audit?: boolean
  auditReads?: boolean
}

interface SecretDoc {
  _id: string
  ciphertext: string
  wrappedDek: string
  keyVersion: number
  createdAt: Date
  updatedAt: Date
}

interface SecretAuditDoc {
  _id: string
  secretKey: string
  action: string
  performedAt: Date
}

export class MongoDBSecretService implements SecretService {
  private initialized = false
  private key: string
  private keyVersion: number
  private previousKey?: string
  private audit: boolean
  private auditReads: boolean
  private secrets!: Collection<SecretDoc>
  private secretsAudit!: Collection<SecretAuditDoc>

  constructor(
    private db: Db,
    config: MongoDBSecretServiceConfig
  ) {
    this.key = config.key
    this.keyVersion = config.keyVersion ?? 1
    this.previousKey = config.previousKey
    this.audit = config.audit ?? false
    this.auditReads = config.auditReads ?? false
  }

  public async init(): Promise<void> {
    if (this.initialized) return

    this.secrets = this.db.collection<SecretDoc>('secrets')
    this.secretsAudit = this.db.collection<SecretAuditDoc>('secrets_audit')

    await this.secrets.createIndex({ _id: 1 })

    if (this.audit) {
      await this.secretsAudit.createIndex({ secretKey: 1 })
    }

    this.initialized = true
  }

  private async logAudit(
    secretKey: string,
    action: 'read' | 'write' | 'delete' | 'rotate'
  ): Promise<void> {
    if (!this.audit) return
    if (action === 'read' && !this.auditReads) return

    await this.secretsAudit.insertOne({
      _id: crypto.randomUUID(),
      secretKey,
      action,
      performedAt: new Date(),
    })
  }

  private getKEK(version: number): string {
    if (version === this.keyVersion) return this.key
    if (this.previousKey) return this.previousKey
    throw new Error(`No KEK available for key_version ${version}`)
  }

  async getSecret<T = string>(key: string): Promise<T> {
    const row = await this.secrets.findOne({ _id: key })
    if (!row) throw new Error('Requested secret not found')

    const kek = this.getKEK(row.keyVersion)
    const result = await envelopeDecrypt<T>(kek, row.ciphertext, row.wrappedDek)
    await this.logAudit(key, 'read')
    return result
  }

  async hasSecret(key: string): Promise<boolean> {
    const count = await this.secrets.countDocuments({ _id: key }, { limit: 1 })
    return count > 0
  }

  async setSecret(key: string, value: unknown): Promise<void> {
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(this.key, value)
    const now = new Date()

    await this.secrets.updateOne(
      { _id: key },
      {
        $set: {
          ciphertext,
          wrappedDek: wrappedDEK,
          keyVersion: this.keyVersion,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: key,
          createdAt: now,
        },
      },
      { upsert: true }
    )

    await this.logAudit(key, 'write')
  }

  async deleteSecret(key: string): Promise<void> {
    await this.secrets.deleteOne({ _id: key })
    await this.logAudit(key, 'delete')
  }

  async getSecrets<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(keys: (keyof T & string)[]): Promise<T> {
    const rows = await this.secrets
      .find({ _id: { $in: keys } } as any)
      .toArray()
    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        const kek = this.getKEK(row.keyVersion)
        out[row._id] = await envelopeDecrypt(
          kek,
          row.ciphertext,
          row.wrappedDek
        )
      } catch {
        // skip secrets that fail to decrypt
      }
    }
    return out as T
  }

  async rotateKEK(): Promise<number> {
    if (!this.previousKey) {
      throw new Error('No previousKey configured — nothing to rotate from')
    }

    const rows = await this.secrets
      .find({ keyVersion: { $lt: this.keyVersion } })
      .project({ _id: 1, wrappedDek: 1 })
      .toArray()

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(
        this.previousKey,
        this.key,
        row.wrappedDek
      )
      await this.secrets.updateOne(
        { _id: row._id },
        {
          $set: {
            wrappedDek: newWrappedDEK,
            keyVersion: this.keyVersion,
            updatedAt: new Date(),
          },
        }
      )
      await this.logAudit(row._id as string, 'rotate')
    }

    return rows.length
  }
}
