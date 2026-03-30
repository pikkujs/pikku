import type {
  DeploymentService,
  DeploymentServiceConfig,
  DeploymentConfig,
} from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import type { Db, Collection } from 'mongodb'

interface DeploymentDoc {
  _id: string
  endpoint: string
  lastHeartbeat: Date
  createdAt: Date
  functions: string[]
}

export class MongoDBDeploymentService implements DeploymentService {
  private initialized = false
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number
  private deployments!: Collection<DeploymentDoc>

  constructor(
    config: DeploymentServiceConfig,
    private db: Db
  ) {
    this.heartbeatInterval = config.heartbeatInterval ?? 10000
    this.heartbeatTtl = config.heartbeatTtl ?? 30000
  }

  public async init(): Promise<void> {
    if (this.initialized) return

    this.deployments = this.db.collection<DeploymentDoc>('pikku_deployments')

    await this.deployments.createIndex({ lastHeartbeat: 1 })
    await this.deployments.createIndex({ functions: 1 })

    this.initialized = true
  }

  async start(config: DeploymentConfig): Promise<void> {
    const functions = config.functions ?? getAllFunctionNames()
    this.deploymentConfig = { ...config, functions }
    const now = new Date()

    await this.deployments.updateOne(
      { _id: config.deploymentId },
      {
        $set: {
          endpoint: config.endpoint,
          lastHeartbeat: now,
          functions,
        },
        $setOnInsert: {
          _id: config.deploymentId,
          createdAt: now,
        },
      },
      { upsert: true }
    )

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
      await this.deployments.deleteOne({
        _id: this.deploymentConfig.deploymentId,
      })
    }
  }

  async invoke(
    funcName: string,
    data: unknown,
    _session?: unknown
  ): Promise<unknown> {
    const cutoff = new Date(Date.now() - this.heartbeatTtl)
    const result = await this.deployments.findOne(
      { functions: funcName, lastHeartbeat: { $gt: cutoff } },
      { sort: { lastHeartbeat: -1 } }
    )
    if (!result) {
      throw new Error(`No deployment found for function '${funcName}'`)
    }
    const url = `${result.endpoint}/rpc/${encodeURIComponent(funcName)}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
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

    try {
      await this.deployments.updateOne(
        { _id: this.deploymentConfig.deploymentId },
        { $set: { lastHeartbeat: new Date() } }
      )
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
