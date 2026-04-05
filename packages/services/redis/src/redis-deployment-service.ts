import { AbstractHTTPDeploymentService } from '@pikku/core/services'
import type {
  DeploymentServiceConfig,
  DeploymentConfig,
} from '@pikku/core/services'
import type { JWTService, SecretService } from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import { Redis, type RedisOptions } from 'ioredis'

export class RedisDeploymentService extends AbstractHTTPDeploymentService {
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
    keyPrefix = 'pikku',
    jwt?: JWTService,
    secrets?: SecretService
  ) {
    super(jwt, secrets)
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
    const expiryScore = Date.now() + this.heartbeatTtl

    const pipeline = this.redis.pipeline()

    pipeline.hset(this.deploymentKey(config.deploymentId), {
      endpoint: config.endpoint,
      functions: JSON.stringify(functions),
    })
    pipeline.expire(this.deploymentKey(config.deploymentId), ttlSeconds)

    for (const fn of functions) {
      pipeline.zadd(
        this.functionsIndexKey(fn),
        expiryScore,
        config.deploymentId
      )
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
        pipeline.zrem(this.functionsIndexKey(fn), deploymentId)
      }

      await pipeline.exec()
    }

    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }

  protected async dispatch(
    funcName: string,
    data: unknown,
    headers: Record<string, string>
  ): Promise<unknown> {
    const indexKey = this.functionsIndexKey(funcName)
    const now = Date.now()

    await this.redis.zremrangebyscore(indexKey, '-inf', now)
    const deploymentIds = await this.redis.zrangebyscore(indexKey, now, '+inf')

    let endpoint: string | null = null
    for (const deploymentId of deploymentIds) {
      endpoint = await this.redis.hget(
        this.deploymentKey(deploymentId),
        'endpoint'
      )
      if (endpoint) break
    }

    if (!endpoint) {
      throw new Error(`No deployment found for function '${funcName}'`)
    }

    const url = `${endpoint}/remote/rpc/${encodeURIComponent(funcName)}`
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(
        `Remote RPC call to '${funcName}' failed: ${response.status}`
      )
    }
    return response.json()
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.deploymentConfig) return

    const { deploymentId, functions } = this.deploymentConfig
    const ttlSeconds = Math.ceil(this.heartbeatTtl / 1000)
    const expiryScore = Date.now() + this.heartbeatTtl

    try {
      const pipeline = this.redis.pipeline()
      pipeline.expire(this.deploymentKey(deploymentId), ttlSeconds)
      for (const fn of functions!) {
        pipeline.zadd(this.functionsIndexKey(fn), expiryScore, deploymentId)
      }
      await pipeline.exec()
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
