import {
  deriveKEK,
  envelopeDecrypt,
  envelopeEncrypt,
  envelopeRewrap,
  generateKEKSalt,
} from '@pikku/core/crypto-utils'
import { createSecretValue, isSecretValue } from '@pikku/core/secret-value'
import type { SecretService, SecretValues } from '@pikku/core/services'
import type { SecretValue } from '@pikku/core/secret-value'
import { Redis, type RedisOptions } from 'ioredis'

export interface RedisSecretServiceConfig {
  key: string
  keyVersion?: number
  previousKey?: string
  keyPrefix?: string
}

export class RedisSecretService implements SecretService {
  private redis: Redis
  private ownsConnection: boolean
  private key: string
  private keyVersion: number
  private previousKey?: string
  private keyPrefix: string
  private kekSalts = new Map<number, string>()
  private keks = new Map<number, CryptoKey>()

  constructor(
    connectionOrConfig: Redis | RedisOptions | string,
    config: RedisSecretServiceConfig
  ) {
    if (
      typeof connectionOrConfig === 'object' &&
      'hgetall' in connectionOrConfig &&
      'hset' in connectionOrConfig
    ) {
      this.redis = connectionOrConfig as Redis
      this.ownsConnection = false
    } else if (typeof connectionOrConfig === 'string') {
      this.redis = new Redis(connectionOrConfig)
      this.ownsConnection = true
    } else {
      this.redis = new Redis(connectionOrConfig)
      this.ownsConnection = true
    }

    this.key = config.key
    this.keyVersion = config.keyVersion ?? 1
    this.previousKey = config.previousKey
    this.keyPrefix = config.keyPrefix ?? 'pikku'
  }

  private secretKey(key: string): string {
    return `${this.keyPrefix}:secret:${key}`
  }

  private saltKey(): string {
    return `${this.keyPrefix}:kek-salt`
  }

  private async getKEKSalt(version: number): Promise<string> {
    const cached = this.kekSalts.get(version)
    if (cached) return cached

    const field = String(version)
    let salt = await this.redis.hget(this.saltKey(), field)
    if (!salt) {
      await this.redis.hsetnx(this.saltKey(), field, generateKEKSalt())
      salt = await this.redis.hget(this.saltKey(), field)
      if (!salt) {
        throw new Error(
          `Failed to persist a KEK salt for key_version ${version}`
        )
      }
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
    const data = await this.redis.hgetall(this.secretKey(key))
    if (!data.ciphertext) throw new Error('Requested secret not found')

    const kek = await this.getKEK(Number(data.key_version))
    return createSecretValue(
      await envelopeDecrypt<T>(kek, data.ciphertext!, data.wrapped_dek!)
    )
  }

  async hasSecret(key: string): Promise<boolean> {
    const exists = await this.redis.exists(this.secretKey(key))
    return exists === 1
  }

  async setSecret(key: string, value: unknown): Promise<void> {
    // Encrypting the wrapper would store its redaction, not the secret —
    // writing a secret back to the vault is exactly what this method is for.
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      await this.getKEK(this.keyVersion),
      isSecretValue(value) ? value.reveal() : value
    )

    await this.redis.hset(this.secretKey(key), {
      ciphertext,
      wrapped_dek: wrappedDEK,
      key_version: this.keyVersion.toString(),
    })
  }

  async deleteSecret(key: string): Promise<void> {
    await this.redis.del(this.secretKey(key))
  }

  async getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<SecretValues<T>>> {
    const rows = await Promise.all(
      keys.map(async (key) => ({
        key,
        data: await this.redis.hgetall(this.secretKey(key)),
      }))
    )

    const out: Record<string, unknown> = {}
    for (const { key, data } of rows) {
      if (!data.ciphertext) continue

      const keyVersion = Number(data.key_version)
      try {
        const kek = await this.getKEK(keyVersion)
        out[key] = createSecretValue(
          await envelopeDecrypt(kek, data.ciphertext, data.wrapped_dek!)
        )
      } catch (cause) {
        throw new Error(
          `Failed to decrypt secret "${key}" (key_version ${keyVersion}): ` +
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

    const oldKEK = await this.getKEK(this.keyVersion - 1)
    const newKEK = await this.getKEK(this.keyVersion)

    const pattern = `${this.keyPrefix}:secret:*`
    let cursor = '0'
    let count = 0

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = nextCursor

      for (const redisKey of keys) {
        const data = await this.redis.hgetall(redisKey)
        const version = Number(data.key_version)
        if (version >= this.keyVersion) continue

        const newWrappedDEK = await envelopeRewrap(
          oldKEK,
          newKEK,
          data.wrapped_dek!
        )
        await this.redis.hset(redisKey, {
          wrapped_dek: newWrappedDEK,
          key_version: this.keyVersion.toString(),
        })
        count++
      }
    } while (cursor !== '0')

    return count
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
