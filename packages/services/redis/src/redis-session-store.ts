import type { CoreUserSession } from '@pikku/core'
import type { SessionStore } from '@pikku/core/services'
import { Redis, type RedisOptions } from 'ioredis'

export class RedisSessionStore implements SessionStore {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean
  private ttlSeconds?: number

  /**
   * @param connectionOrConfig - ioredis Redis instance or RedisOptions config
   * @param keyPrefix - Redis key prefix (default: 'pikku')
   * @param ttlSeconds - Optional TTL in seconds for session entries
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string,
    keyPrefix = 'pikku',
    ttlSeconds?: number
  ) {
    this.keyPrefix = keyPrefix
    this.ttlSeconds = ttlSeconds

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
  }

  public async init(): Promise<void> {
    await this.redis.ping()
  }

  private sessionKey(pikkuUserId: string): string {
    return `${this.keyPrefix}:session:${pikkuUserId}`
  }

  async get(pikkuUserId: string): Promise<CoreUserSession | undefined> {
    const data = await this.redis.get(this.sessionKey(pikkuUserId))
    if (!data) {
      return undefined
    }
    return JSON.parse(data) as CoreUserSession
  }

  async set(pikkuUserId: string, session: CoreUserSession): Promise<void> {
    const key = this.sessionKey(pikkuUserId)
    const value = JSON.stringify(session)
    if (this.ttlSeconds) {
      await this.redis.set(key, value, 'EX', this.ttlSeconds)
    } else {
      await this.redis.set(key, value)
    }
  }

  async clear(pikkuUserId: string): Promise<void> {
    await this.redis.del(this.sessionKey(pikkuUserId))
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
