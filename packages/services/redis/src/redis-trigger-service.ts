import type { CoreSingletonServices, DeploymentService } from '@pikku/core'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from '@pikku/core'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Redis-based implementation of TriggerService
 *
 * Stores trigger registrations and manages distributed claiming.
 * Uses DeploymentService for liveness checks instead of heartbeat-based locking.
 *
 * @example
 * ```typescript
 * const deploymentService = new RedisDeploymentService(redis, 'pikku')
 * const triggerService = new RedisTriggerService(singletonServices, deploymentService)
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

  /**
   * @param singletonServices - Core singleton services
   * @param deploymentService - DeploymentService for liveness checks
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   * @param keyPrefix - Redis key prefix (default: 'pikku:triggers')
   */
  constructor(
    singletonServices: CoreSingletonServices,
    deploymentService: DeploymentService,
    connectionOrConfig?: Redis | RedisOptions | string,
    keyPrefix = 'pikku:triggers'
  ) {
    super(singletonServices, deploymentService)
    this.keyPrefix = keyPrefix

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

  /** Set key tracking which deployments are interested in a trigger+input */
  private regDeploymentKey(triggerName: string, inputHash: string): string {
    return `${this.keyPrefix}:reg-dep:${triggerName}:${inputHash}`
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

    // Associate this deployment with the trigger+input
    await this.redis.sadd(
      this.regDeploymentKey(registration.triggerName, registration.inputHash),
      this.deploymentService.deploymentId
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
      // Clean up all deployment associations for this trigger+input
      await this.redis.del(
        this.regDeploymentKey(registration.triggerName, registration.inputHash)
      )
    }
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers: string[]
  ): Promise<TriggerInputInstance[]> {
    const members = await this.redis.smembers(this.regIndexKey())
    const results: TriggerInputInstance[] = []

    for (const member of members) {
      const separatorIndex = member.indexOf(':')
      const triggerName = member.substring(0, separatorIndex)
      const inputHash = member.substring(separatorIndex + 1)

      if (!supportedTriggers.includes(triggerName)) {
        continue
      }

      // Check if this deployment is associated with this trigger+input
      const isMember = await this.redis.sismember(
        this.regDeploymentKey(triggerName, inputHash),
        this.deploymentService.deploymentId
      )
      if (!isMember) {
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
    const deploymentId = this.deploymentService.deploymentId

    const existing = await this.redis.hgetall(key)

    if (existing.ownerDeploymentId) {
      const isOurs = existing.ownerDeploymentId === deploymentId

      if (!isOurs) {
        const alive = await this.deploymentService.isDeploymentAlive(
          existing.ownerDeploymentId
        )
        if (alive) {
          return false
        }
      }
    }

    await this.redis.hset(key, {
      ownerDeploymentId: deploymentId,
    })

    return true
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    const key = this.instanceKey(triggerName, inputHash)
    const owner = await this.redis.hget(key, 'ownerDeploymentId')
    if (owner === this.deploymentService.deploymentId) {
      await this.redis.del(key)
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
