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

  private getKEK(version: number): string {
    if (version === this.keyVersion) return this.key
    if (this.previousKey) return this.previousKey
    throw new Error(`No KEK available for key_version ${version}`)
  }

  async getSecret<T = string>(key: string): Promise<T> {
    const data = await this.redis.hgetall(this.secretKey(key))
    if (!data.ciphertext) throw new Error('Requested secret not found')

    const kek = this.getKEK(Number(data.key_version))
    return envelopeDecrypt<T>(kek, data.ciphertext!, data.wrapped_dek!)
  }

  async hasSecret(key: string): Promise<boolean> {
    const exists = await this.redis.exists(this.secretKey(key))
    return exists === 1
  }

  async setSecret(key: string, value: unknown): Promise<void> {
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(this.key, value)

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
  ): Promise<T> {
    const results = await Promise.allSettled(keys.map((k) => this.getSecret(k)))
    const out: Record<string, unknown> = {}
    keys.forEach((key, i) => {
      const result = results[i]
      if (result?.status === 'fulfilled') out[key] = result.value
    })
    return out as T
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
