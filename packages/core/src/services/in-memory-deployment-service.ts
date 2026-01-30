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

  protected async registerProcess(): Promise<void> {
    this.deployments.set(this.deploymentId, { heartbeatAt: Date.now() })
  }

  protected async unregisterProcess(): Promise<void> {
    this.deployments.delete(this.deploymentId)
  }

  protected async updateHeartbeat(): Promise<void> {
    const entry = this.deployments.get(this.deploymentId)
    if (entry) {
      entry.heartbeatAt = Date.now()
    }
  }

  async isProcessAlive(deploymentId: string): Promise<boolean> {
    const entry = this.deployments.get(deploymentId)
    if (!entry) return false
    return Date.now() - entry.heartbeatAt < this.heartbeatTimeoutMs
  }

  async getAliveDeploymentIds(): Promise<string[]> {
    const now = Date.now()
    const alive: string[] = []
    for (const [id, entry] of this.deployments) {
      if (now - entry.heartbeatAt < this.heartbeatTimeoutMs) {
        alive.push(id)
      }
    }
    return alive
  }
}
