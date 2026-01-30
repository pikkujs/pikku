import type { CoreSingletonServices } from '@pikku/core'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from '@pikku/core'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Redis-based implementation of TriggerService
 *
 * Stores trigger registrations and manages distributed claiming with heartbeat-based locking.
 * Uses Redis hashes and sorted sets for storage.
 *
 * @example
 * ```typescript
 * const triggerService = new RedisTriggerService(singletonServices)
 * await triggerService.init()
 *
 * await triggerService.register({
 *   trigger: 'my-trigger',
 *   input: { channel: 'my-channel' },
 *   target: { rpc: 'processMessage' }
 * })
 *
 * await triggerService.start()
 * ```
 */
export class RedisTriggerService extends TriggerService {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean
  private heartbeatTimeoutMs: number

  /**
   * @param singletonServices - Core singleton services
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   * @param keyPrefix - Redis key prefix (default: 'pikku:triggers')
   * @param heartbeatTimeoutSeconds - Seconds before a claim expires (default: 30)
   */
  constructor(
    singletonServices: CoreSingletonServices,
    connectionOrConfig?: Redis | RedisOptions | string,
    keyPrefix = 'pikku:triggers',
    heartbeatTimeoutSeconds = 30
  ) {
    super(singletonServices)
    this.keyPrefix = keyPrefix
    this.heartbeatTimeoutMs = heartbeatTimeoutSeconds * 1000

    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
      this.ownsConnection = false
    } else {
      this.redis = new Redis(connectionOrConfig as any)
      this.ownsConnection = true
    }
  }

  public async init(): Promise<void> {
    // No schema setup needed for Redis
  }

  // ============================================
  // Key helpers
  // ============================================

  /** Hash key storing registrations for a trigger+input pair */
  private regKey(triggerName: string, inputHash: string): string {
    return `${this.keyPrefix}:reg:${triggerName}:${inputHash}`
  }

  /** Set key tracking all trigger+input pairs */
  private regIndexKey(): string {
    return `${this.keyPrefix}:reg-index`
  }

  /** Hash key for a claimed instance */
  private instanceKey(triggerName: string, inputHash: string): string {
    return `${this.keyPrefix}:inst:${triggerName}:${inputHash}`
  }

  // ============================================
  // Abstract method implementations
  // ============================================

  protected async storeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    const key = this.regKey(registration.triggerName, registration.inputHash)
    const field = `${registration.targetType}:${registration.targetName}`
    const value = JSON.stringify({
      targetType: registration.targetType,
      targetName: registration.targetName,
    })

    await this.redis.hset(key, field, value)

    // Store input data alongside registrations
    await this.redis.hset(
      key,
      '__input_data__',
      JSON.stringify(registration.inputData)
    )

    // Track this trigger+input in the index
    await this.redis.sadd(
      this.regIndexKey(),
      `${registration.triggerName}:${registration.inputHash}`
    )
  }

  protected async removeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    const key = this.regKey(registration.triggerName, registration.inputHash)
    const field = `${registration.targetType}:${registration.targetName}`

    await this.redis.hdel(key, field)

    // If only __input_data__ remains, clean up entirely
    const remaining = await this.redis.hlen(key)
    if (remaining <= 1) {
      await this.redis.del(key)
      await this.redis.srem(
        this.regIndexKey(),
        `${registration.triggerName}:${registration.inputHash}`
      )
    }
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers?: string[]
  ): Promise<TriggerInputInstance[]> {
    const members = await this.redis.smembers(this.regIndexKey())
    const results: TriggerInputInstance[] = []

    for (const member of members) {
      const separatorIndex = member.indexOf(':')
      const triggerName = member.substring(0, separatorIndex)
      const inputHash = member.substring(separatorIndex + 1)

      if (supportedTriggers && !supportedTriggers.includes(triggerName)) {
        continue
      }

      const key = this.regKey(triggerName, inputHash)
      const inputDataStr = await this.redis.hget(key, '__input_data__')
      const inputData = inputDataStr ? JSON.parse(inputDataStr) : {}

      results.push({ triggerName, inputHash, inputData })
    }

    return results
  }

  protected async getTargetsForTrigger(
    triggerName: string,
    inputHash: string
  ): Promise<Array<{ targetType: 'rpc' | 'workflow'; targetName: string }>> {
    const key = this.regKey(triggerName, inputHash)
    const all = await this.redis.hgetall(key)
    const targets: Array<{
      targetType: 'rpc' | 'workflow'
      targetName: string
    }> = []

    for (const [field, value] of Object.entries(all)) {
      if (field === '__input_data__') continue
      const parsed = JSON.parse(value)
      targets.push({
        targetType: parsed.targetType,
        targetName: parsed.targetName,
      })
    }

    return targets
  }

  protected async tryClaimInstance(
    triggerName: string,
    inputHash: string,
    _inputData: unknown
  ): Promise<boolean> {
    const key = this.instanceKey(triggerName, inputHash)
    const now = Date.now()

    const existing = await this.redis.hgetall(key)

    if (existing.ownerProcessId) {
      const heartbeatAt = parseInt(existing.heartbeatAt ?? '0', 10)
      const isExpired = now - heartbeatAt > this.heartbeatTimeoutMs
      const isOurs = existing.ownerProcessId === this.processId

      if (!isExpired && !isOurs) {
        return false
      }
    }

    await this.redis.hset(key, {
      ownerProcessId: this.processId,
      heartbeatAt: now.toString(),
    })

    return true
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    const key = this.instanceKey(triggerName, inputHash)
    const owner = await this.redis.hget(key, 'ownerProcessId')
    if (owner === this.processId) {
      await this.redis.del(key)
    }
  }

  protected async updateHeartbeat(): Promise<void> {
    const members = await this.redis.smembers(this.regIndexKey())
    const now = Date.now().toString()

    for (const member of members) {
      const separatorIndex = member.indexOf(':')
      const triggerName = member.substring(0, separatorIndex)
      const inputHash = member.substring(separatorIndex + 1)
      const key = this.instanceKey(triggerName, inputHash)
      const owner = await this.redis.hget(key, 'ownerProcessId')
      if (owner === this.processId) {
        await this.redis.hset(key, 'heartbeatAt', now)
      }
    }
  }

  // ============================================
  // Additional public methods
  // ============================================

  async close(): Promise<void> {
    await this.stop()
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
