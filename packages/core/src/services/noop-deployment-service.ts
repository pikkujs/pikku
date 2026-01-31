import { DeploymentService } from './deployment-service.js'

/**
 * No-op implementation of DeploymentService for single-process use.
 *
 * Does nothing — no heartbeats, no registration.
 * Every deployment is considered alive.
 */
export class NoopDeploymentService extends DeploymentService {
  async init(): Promise<void> {}
  protected async registerDeployment(): Promise<void> {}
  protected async unregisterDeployment(): Promise<void> {}
  protected async updateHeartbeat(): Promise<void> {}
  async isDeploymentAlive(_deploymentId: string): Promise<boolean> {
    return true
  }
}
