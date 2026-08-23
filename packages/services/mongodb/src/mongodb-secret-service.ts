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
import type { Db, Collection } from 'mongodb'

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

interface KekSaltDoc {
  _id: number
  salt: string
  createdAt: Date
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
  private kekSaltDocs!: Collection<KekSaltDoc>
  private kekSalts = new Map<number, string>()
  private keks = new Map<number, CryptoKey>()

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
    this.kekSaltDocs = this.db.collection<KekSaltDoc>('secret_kek_salts')

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

  private async getKEKSalt(version: number): Promise<string> {
    const cached = this.kekSalts.get(version)
    if (cached) return cached

    const doc = await this.kekSaltDocs.findOneAndUpdate(
      { _id: version },
      { $setOnInsert: { salt: generateKEKSalt(), createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    )
    if (!doc?.salt) {
      throw new Error(`Failed to persist a KEK salt for key_version ${version}`)
    }

    this.kekSalts.set(version, doc.salt)
    return doc.salt
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
    const row = await this.secrets.findOne({ _id: key })
    if (!row) throw new Error(`Requested secret not found: ${key}`)

    const kek = await this.getKEK(row.keyVersion)
    const result = await envelopeDecrypt<T>(kek, row.ciphertext, row.wrappedDek)
    await this.logAudit(key, 'read')
    return createSecretValue(result)
  }

  async hasSecret(key: string): Promise<boolean> {
    const count = await this.secrets.countDocuments({ _id: key }, { limit: 1 })
    return count > 0
  }

  async setSecret(key: string, value: unknown): Promise<void> {
    // Encrypting the wrapper would store its redaction, not the secret —
    // writing a secret back to the vault is exactly what this method is for.
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      await this.getKEK(this.keyVersion),
      isSecretValue(value) ? value.reveal() : value
    )
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

  async getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<SecretValues<T>>> {
    const rows = await this.secrets
      .find({ _id: { $in: keys } } as any)
      .toArray()
    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        const kek = await this.getKEK(row.keyVersion)
        out[row._id] = createSecretValue(
          await envelopeDecrypt(kek, row.ciphertext, row.wrappedDek)
        )
      } catch (cause) {
        throw new Error(
          `Failed to decrypt secret "${row._id}" (key_version ${row.keyVersion}): ` +
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

    const rows = await this.secrets
      .find({ keyVersion: { $lt: this.keyVersion } })
      .project({ _id: 1, wrappedDek: 1 })
      .toArray()

    const oldKEK = await this.getKEK(this.keyVersion - 1)
    const newKEK = await this.getKEK(this.keyVersion)

    for (const row of rows) {
      const newWrappedDEK = await envelopeRewrap(oldKEK, newKEK, row.wrappedDek)
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
