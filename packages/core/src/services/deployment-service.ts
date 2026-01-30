import { randomUUID } from 'crypto'

/**
 * Abstract base class for DeploymentService implementations.
 *
 * Tracks live processes/deployments with heartbeats for distributed locking.
 * Other services (e.g. TriggerService) use this to check if an owning process
 * is still alive before claiming resources.
 *
 * @example
 * ```typescript
 * const deploymentService = new PgDeploymentService(sql, 'pikku')
 * await deploymentService.init()
 * await deploymentService.start()
 *
 * // Check if a deployment is alive
 * const alive = await deploymentService.isProcessAlive(someDeploymentId)
 *
 * // On shutdown
 * await deploymentService.stop()
 * ```
 */
export abstract class DeploymentService {
  readonly deploymentId: string = randomUUID()
  protected heartbeatInterval: ReturnType<typeof setInterval> | null = null

  abstract init(): Promise<void>

  /**
   * Register this deployment and start heartbeat interval
   */
  protected abstract registerDeployment(): Promise<void>

  /**
   * Unregister this deployment
   */
  protected abstract unregisterDeployment(): Promise<void>

  /**
   * Update the heartbeat timestamp for this deployment
   */
  protected abstract updateHeartbeat(): Promise<void>

  /**
   * Check if a deployment is still alive (heartbeat within timeout)
   */
  abstract isDeploymentAlive(deploymentId: string): Promise<boolean>

  /**
   * Start this deployment: register and begin heartbeat
   */
  async start(): Promise<void> {
    await this.registerDeployment()
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat().catch(() => {})
    }, 10_000)
  }

  /**
   * Stop this deployment: stop heartbeat and unregister
   */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    await this.unregisterDeployment()
  }
}
