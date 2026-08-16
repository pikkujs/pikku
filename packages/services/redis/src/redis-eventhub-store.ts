import type { EventHubStore } from '@pikku/core/channel'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Redis-based implementation of EventHubStore
 *
 * Manages pub/sub topic subscriptions for channels in Redis.
 *
 * @example
 * ```typescript
 * const redis = new Redis({ host: 'localhost', port: 6379 })
 * const store = new RedisEventHubStore(redis, 'myapp')
 * await store.subscribe('user.123', channelId)
 * ```
 */
export class RedisEventHubStore implements EventHubStore {
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
    await this.redis.ping()
  }

  private topicKey(topic: string): string {
    return `${this.keyPrefix}:topic:${topic}`
  }

  private channelSubsKey(channelId: string): string {
    return `${this.keyPrefix}:subs:${channelId}`
  }

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const key = this.topicKey(topic)
    return await this.redis.smembers(key)
  }

  public async subscribe(topic: string, channelId: string): Promise<boolean> {
    const topicKey = this.topicKey(topic)
    const subsKey = this.channelSubsKey(channelId)

    // Add channelId to topic set and topic to channel's subscription set
    const pipeline = this.redis.pipeline()
    pipeline.sadd(topicKey, channelId)
    pipeline.sadd(subsKey, topic)

    await pipeline.exec()

    return true
  }

  public async unsubscribe(topic: string, channelId: string): Promise<boolean> {
    const topicKey = this.topicKey(topic)
    const subsKey = this.channelSubsKey(channelId)

    // Remove channelId from topic set and topic from channel's subscription set
    const pipeline = this.redis.pipeline()
    pipeline.srem(topicKey, channelId)
    pipeline.srem(subsKey, topic)

    const results = await pipeline.exec()

    // Check if the channel was actually in the topic set
    return (results![0]![1] as number) > 0
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
