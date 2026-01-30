import { CoreSingletonServices } from '../types/core.types.js'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from './trigger-service.js'
import { DeploymentService } from './deployment-service.js'

/**
 * In-memory implementation of TriggerService for testing and single-process use.
 *
 * Stores all registrations and instance claims in memory.
 * Ideal for:
 * - Integration tests
 * - Single-process applications without persistence requirements
 * - Development and prototyping
 *
 * @example
 * ```typescript
 * const deploymentService = new InMemoryDeploymentService()
 * const triggerService = new InMemoryTriggerService(singletonServices, deploymentService)
 * await triggerService.register({
 *   trigger: 'my-trigger',
 *   input: { channel: 'test' },
 *   target: { rpc: 'handleEvent' },
 * })
 * await triggerService.start()
 * ```
 */
export class InMemoryTriggerService extends TriggerService {
  registrations: TriggerRegistration[] = []
  instances: Map<
    string,
    {
      triggerName: string
      inputHash: string
      inputData: unknown
      ownerDeploymentId: string
    }
  > = new Map()

  constructor(
    singletonServices: CoreSingletonServices,
    deploymentService: DeploymentService
  ) {
    super(singletonServices, deploymentService)
  }

  protected async storeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    const exists = this.registrations.some(
      (r) =>
        r.triggerName === registration.triggerName &&
        r.inputHash === registration.inputHash &&
        r.targetType === registration.targetType &&
        r.targetName === registration.targetName
    )
    if (!exists) {
      this.registrations.push(registration)
    }
  }

  protected async removeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    this.registrations = this.registrations.filter(
      (r) =>
        !(
          r.triggerName === registration.triggerName &&
          r.inputHash === registration.inputHash &&
          r.targetType === registration.targetType &&
          r.targetName === registration.targetName
        )
    )
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers?: string[]
  ): Promise<TriggerInputInstance[]> {
    const seen = new Map<string, TriggerInputInstance>()
    for (const r of this.registrations) {
      if (supportedTriggers && !supportedTriggers.includes(r.triggerName)) {
        continue
      }
      const key = `${r.triggerName}:${r.inputHash}`
      if (!seen.has(key)) {
        seen.set(key, {
          triggerName: r.triggerName,
          inputHash: r.inputHash,
          inputData: r.inputData,
        })
      }
    }
    return Array.from(seen.values())
  }

  protected async getTargetsForTrigger(
    triggerName: string,
    inputHash: string
  ): Promise<Array<{ targetType: 'rpc' | 'workflow'; targetName: string }>> {
    return this.registrations
      .filter((r) => r.triggerName === triggerName && r.inputHash === inputHash)
      .map((r) => ({ targetType: r.targetType, targetName: r.targetName }))
  }

  protected async tryClaimInstance(
    triggerName: string,
    inputHash: string,
    inputData: unknown
  ): Promise<boolean> {
    const key = `${triggerName}:${inputHash}`
    const existing = this.instances.get(key)
    if (existing) {
      const isOurs =
        existing.ownerDeploymentId === this.deploymentService.deploymentId
      if (!isOurs) {
        const alive = await this.deploymentService.isDeploymentAlive(
          existing.ownerDeploymentId
        )
        if (alive) {
          return false
        }
      }
    }
    this.instances.set(key, {
      triggerName,
      inputHash,
      inputData,
      ownerDeploymentId: this.deploymentService.deploymentId,
    })
    return true
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    const key = `${triggerName}:${inputHash}`
    this.instances.delete(key)
  }
}
