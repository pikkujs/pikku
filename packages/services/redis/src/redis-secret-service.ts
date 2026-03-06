import type { SecretService } from '@pikku/core/services'
import { Redis, type RedisOptions } from 'ioredis'
import {
  envelopeEncrypt,
  envelopeDecrypt,
  envelopeRewrap,
} from '@pikku/core/crypto-utils'

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

  constructor(
    connectionOrConfig: Redis | RedisOptions | string,
    config: RedisSecretServiceConfig
  ) {
    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
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

  private getKEK(version: number): string {
    if (version === this.keyVersion) return this.key
    if (this.previousKey) return this.previousKey
    throw new Error(`No KEK available for key_version ${version}`)
  }

  async getSecret(key: string): Promise<string> {
    const data = await this.redis.hgetall(this.secretKey(key))
    if (!data.ciphertext) throw new Error(`Secret not found: ${key}`)

    const kek = this.getKEK(Number(data.key_version))
    return envelopeDecrypt<string>(kek, data.ciphertext!, data.wrapped_dek!)
  }

  async getSecretJSON<R = {}>(key: string): Promise<R> {
    const raw = await this.getSecret(key)
    return JSON.parse(raw) as R
  }

  async hasSecret(key: string): Promise<boolean> {
    const exists = await this.redis.exists(this.secretKey(key))
    return exists === 1
  }

  async setSecretJSON(key: string, value: unknown): Promise<void> {
    const plaintext = JSON.stringify(value)
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(
      this.key,
      plaintext
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

  async rotateKEK(): Promise<number> {
    if (!this.previousKey) {
      throw new Error('No previousKey configured — nothing to rotate from')
    }

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
          this.previousKey,
          this.key,
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
