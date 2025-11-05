import { CoreUserSession } from '@pikku/core'
import { Channel, ChannelStore } from '@pikku/core/channel'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Redis-based implementation of ChannelStore
 *
 * Stores channel state in Redis with configurable key prefix.
 *
 * @example
 * ```typescript
 * const redis = new Redis({ host: 'localhost', port: 6379 })
 * const store = new RedisChannelStore(redis, 'myapp')
 * ```
 */
export class RedisChannelStore extends ChannelStore {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean

  /**
   * @param connectionOrConfig - ioredis Redis instance or RedisOptions config
   * @param keyPrefix - Redis key prefix (default: 'pikku')
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string,
    keyPrefix = 'pikku'
  ) {
    super()
    this.keyPrefix = keyPrefix

    // Check if it's a Redis instance or config options
    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
      this.ownsConnection = false
    } else if (typeof connectionOrConfig === 'string') {
      // It's a connection string
      this.redis = new Redis(connectionOrConfig)
      this.ownsConnection = true
    } else {
      // It's a config object
      this.redis = new Redis(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  /**
   * Initialize the store (no-op for Redis, always ready)
   */
  public async init(): Promise<void> {
    // Redis doesn't require schema initialization
    // Just verify connection works
    await this.redis.ping()
  }

  private channelKey(channelId: string): string {
    return `${this.keyPrefix}:channel:${channelId}`
  }

  public async addChannel({
    channelId,
    channelName,
    openingData,
  }: Channel): Promise<void> {
    const key = this.channelKey(channelId)

    await this.redis.hmset(
      key,
      'channelId',
      channelId,
      'channelName',
      channelName,
      'openingData',
      JSON.stringify(openingData || {}),
      'createdAt',
      Date.now().toString()
    )
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) {
      return
    }

    const pipeline = this.redis.pipeline()

    for (const channelId of channelIds) {
      const key = this.channelKey(channelId)
      pipeline.del(key)
      // Also remove from subscriptions
      pipeline.del(`${this.keyPrefix}:subs:${channelId}`)
    }

    await pipeline.exec()
  }

  public async setUserSession(
    channelId: string,
    session: CoreUserSession | null
  ): Promise<void> {
    const key = this.channelKey(channelId)

    if (session) {
      await this.redis.hset(key, 'userSession', JSON.stringify(session))
    } else {
      await this.redis.hdel(key, 'userSession')
    }
  }

  public async getChannelAndSession(
    channelId: string
  ): Promise<Channel & { session: CoreUserSession }> {
    const key = this.channelKey(channelId)
    const data = await this.redis.hgetall(key)

    if (!data.channelId) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    return {
      channelId: data.channelId!,
      channelName: data.channelName!,
      openingData: data.openingData ? JSON.parse(data.openingData) : {},
      session: data.userSession ? JSON.parse(data.userSession) : {},
    }
  }

  /**
   * Close the Redis connection if owned by this store
   */
  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
