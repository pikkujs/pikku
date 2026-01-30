import { DeploymentService } from '@pikku/core'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Redis-based implementation of DeploymentService.
 *
 * Uses Redis keys with TTL-based expiry for automatic cleanup.
 * Key format: `{prefix}:deployment:{deploymentId}`
 *
 * @example
 * ```typescript
 * const deploymentService = new RedisDeploymentService(redis, 'pikku')
 * await deploymentService.init()
 * await deploymentService.start()
 * ```
 */
export class RedisDeploymentService extends DeploymentService {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean
  private heartbeatTimeoutSeconds: number

  /**
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   * @param keyPrefix - Redis key prefix (default: 'pikku')
   * @param heartbeatTimeoutSeconds - Seconds before a deployment key expires (default: 30)
   */
  constructor(
    connectionOrConfig?: Redis | RedisOptions | string,
    keyPrefix = 'pikku',
    heartbeatTimeoutSeconds = 30
  ) {
    super()
    this.keyPrefix = keyPrefix
    this.heartbeatTimeoutSeconds = heartbeatTimeoutSeconds

    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
      this.ownsConnection = false
    } else {
      this.redis = new Redis(connectionOrConfig as any)
      this.ownsConnection = true
    }
  }

  async init(): Promise<void> {}

  private deploymentKey(deploymentId: string): string {
    return `${this.keyPrefix}:deployment:${deploymentId}`
  }

  private deploymentIndexKey(): string {
    return `${this.keyPrefix}:deployment-index`
  }

  protected async registerProcess(): Promise<void> {
    const key = this.deploymentKey(this.deploymentId)
    await this.redis.set(
      key,
      Date.now().toString(),
      'EX',
      this.heartbeatTimeoutSeconds
    )
    await this.redis.sadd(this.deploymentIndexKey(), this.deploymentId)
  }

  protected async unregisterProcess(): Promise<void> {
    const key = this.deploymentKey(this.deploymentId)
    await this.redis.del(key)
    await this.redis.srem(this.deploymentIndexKey(), this.deploymentId)
  }

  protected async updateHeartbeat(): Promise<void> {
    const key = this.deploymentKey(this.deploymentId)
    await this.redis.set(
      key,
      Date.now().toString(),
      'EX',
      this.heartbeatTimeoutSeconds
    )
  }

  async isProcessAlive(deploymentId: string): Promise<boolean> {
    const key = this.deploymentKey(deploymentId)
    const exists = await this.redis.exists(key)
    return exists === 1
  }

  async getAliveDeploymentIds(): Promise<string[]> {
    const members = await this.redis.smembers(this.deploymentIndexKey())
    const alive: string[] = []
    for (const id of members) {
      if (await this.isProcessAlive(id)) {
        alive.push(id)
      } else {
        // Clean up stale index entry
        await this.redis.srem(this.deploymentIndexKey(), id)
      }
    }
    return alive
  }

  /**
   * Close the Redis connection if we own it
   */
  async close(): Promise<void> {
    await this.stop()
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
