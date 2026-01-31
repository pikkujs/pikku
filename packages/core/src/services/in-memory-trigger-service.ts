import { CoreSingletonServices } from '../types/core.types.js'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from './trigger-service.js'
import { NoopDeploymentService } from './noop-deployment-service.js'

/**
 * In-memory implementation of TriggerService for single-process use.
 *
 * Since this is always single-process, there is no need for deployment
 * tracking or distributed claiming — all registrations belong to this
 * process and claiming always succeeds.
 *
 * Uses a NoopDeploymentService by default.
 *
 * Ideal for:
 * - Integration tests
 * - Single-process applications without persistence requirements
 * - Development and prototyping
 *
 * @example
 * ```typescript
 * const triggerService = new InMemoryTriggerService(singletonServices)
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

  constructor(singletonServices: CoreSingletonServices) {
    super(singletonServices, new NoopDeploymentService())
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
    supportedTriggers: string[]
  ): Promise<TriggerInputInstance[]> {
    const seen = new Map<string, TriggerInputInstance>()
    for (const r of this.registrations) {
      if (!supportedTriggers.includes(r.triggerName)) {
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
    _triggerName: string,
    _inputHash: string,
    _inputData: unknown
  ): Promise<boolean> {
    // Single-process: always claim successfully
    return true
  }

  protected async releaseInstance(
    _triggerName: string,
    _inputHash: string
  ): Promise<void> {
    // Single-process: nothing to release
  }
}
