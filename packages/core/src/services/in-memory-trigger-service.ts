import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from './trigger-service.js'

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
  instances: Map<
    string,
    {
      triggerName: string
      inputHash: string
      inputData: unknown
      ownerProcessId: string
      heartbeatAt: Date
    }
  > = new Map()
  heartbeatCount = 0

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
    if (existing && existing.ownerProcessId !== this.processId) {
      return false
    }
    this.instances.set(key, {
      triggerName,
      inputHash,
      inputData,
      ownerProcessId: this.processId,
      heartbeatAt: new Date(),
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

  protected async updateHeartbeat(): Promise<void> {
    this.heartbeatCount++
    for (const [_key, instance] of this.instances) {
      if (instance.ownerProcessId === this.processId) {
        instance.heartbeatAt = new Date()
      }
    }
  }
}
