import { DeploymentService } from './deployment-service.js'

/**
 * In-memory implementation of DeploymentService for testing and single-process use.
 *
 * @example
 * ```typescript
 * const deploymentService = new InMemoryDeploymentService()
 * await deploymentService.init()
 * await deploymentService.start()
 * ```
 */
export class InMemoryDeploymentService extends DeploymentService {
  private deployments = new Map<string, { heartbeatAt: number }>()
  private heartbeatTimeoutMs: number

  constructor(heartbeatTimeoutMs = 30_000) {
    super()
    this.heartbeatTimeoutMs = heartbeatTimeoutMs
  }

  async init(): Promise<void> {}

  protected async registerDeployment(): Promise<void> {
    this.deployments.set(this.deploymentId, { heartbeatAt: Date.now() })
  }

  protected async unregisterDeployment(): Promise<void> {
    this.deployments.delete(this.deploymentId)
  }

  protected async updateHeartbeat(): Promise<void> {
    const entry = this.deployments.get(this.deploymentId)
    if (entry) {
      entry.heartbeatAt = Date.now()
    }
  }

  async isDeploymentAlive(deploymentId: string): Promise<boolean> {
    const entry = this.deployments.get(deploymentId)
    if (!entry) return false
    return Date.now() - entry.heartbeatAt < this.heartbeatTimeoutMs
  }
}
