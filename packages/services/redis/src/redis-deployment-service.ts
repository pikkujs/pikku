import type {
  DeploymentService,
  DeploymentServiceConfig,
  DeploymentConfig,
  DeploymentInfo,
} from '@pikku/core'
import { getAllFunctionNames } from '@pikku/core'
import { Redis, type RedisOptions } from 'ioredis'

export class RedisDeploymentService implements DeploymentService {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number

  constructor(
    config: DeploymentServiceConfig,
    connectionOrConfig: Redis | RedisOptions | string,
    keyPrefix = 'pikku'
  ) {
    this.heartbeatInterval = config.heartbeatInterval ?? 10000
    this.heartbeatTtl = config.heartbeatTtl ?? 30000
    this.keyPrefix = keyPrefix

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

  private deploymentKey(deploymentId: string): string {
    return `${this.keyPrefix}:deployment:${deploymentId}`
  }

  private functionsIndexKey(funcName: string): string {
    return `${this.keyPrefix}:fn:${funcName}`
  }

  public async init(): Promise<void> {}

  async start(config: DeploymentConfig): Promise<void> {
    const functions = config.functions ?? getAllFunctionNames()
    this.deploymentConfig = { ...config, functions }
    const ttlSeconds = Math.ceil(this.heartbeatTtl / 1000)

    const pipeline = this.redis.pipeline()

    pipeline.hset(this.deploymentKey(config.deploymentId), {
      endpoint: config.endpoint,
      functions: JSON.stringify(functions),
    })
    pipeline.expire(this.deploymentKey(config.deploymentId), ttlSeconds)

    for (const fn of functions) {
      pipeline.sadd(this.functionsIndexKey(fn), config.deploymentId)
    }

    await pipeline.exec()

    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.heartbeatInterval
    )
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }

    if (this.deploymentConfig) {
      const { deploymentId, functions } = this.deploymentConfig
      const pipeline = this.redis.pipeline()

      pipeline.del(this.deploymentKey(deploymentId))
      for (const fn of functions!) {
        pipeline.srem(this.functionsIndexKey(fn), deploymentId)
      }

      await pipeline.exec()
    }

    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }

  async findFunction(name: string): Promise<DeploymentInfo[]> {
    const deploymentIds = await this.redis.smembers(
      this.functionsIndexKey(name)
    )

    if (deploymentIds.length === 0) {
      return []
    }

    const results: DeploymentInfo[] = []

    for (const deploymentId of deploymentIds) {
      const endpoint = await this.redis.hget(
        this.deploymentKey(deploymentId),
        'endpoint'
      )
      if (endpoint) {
        results.push({ deploymentId, endpoint })
      } else {
        await this.redis.srem(this.functionsIndexKey(name), deploymentId)
      }
    }

    return results
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.deploymentConfig) return

    const ttlSeconds = Math.ceil(this.heartbeatTtl / 1000)

    try {
      await this.redis.expire(
        this.deploymentKey(this.deploymentConfig.deploymentId),
        ttlSeconds
      )
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
