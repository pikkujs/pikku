import { PikkuTriggerService } from '../wirings/trigger/pikku-trigger-service.js'

/**
 * In-memory TriggerService implementation.
 *
 * Reads both `wireTrigger` declarations and `wireTriggerSource` registrations
 * from pikkuState. Only starts triggers that have both a declaration and a source.
 * On fire, invokes target via `ContextAwareRPCService`.
 *
 * Single owner — one process runs triggers, no distributed claiming.
 *
 * @example
 * ```typescript
 * const triggerService = new InMemoryTriggerService()
 * triggerService.setServices(singletonServices, createWireServices)
 * await triggerService.start()
 *
 * // On shutdown
 * await triggerService.stop()
 * ```
 */
export class InMemoryTriggerService extends PikkuTriggerService {
  async start(): Promise<void> {
    if (!this.singletonServices) {
      throw new Error(
        'InMemoryTriggerService requires singletonServices to start triggers'
      )
    }

    const triggerTargets = this.getTriggerTargets()
    const triggerSources = this.getTriggerSources()

    for (const [name, source] of triggerSources) {
      if (this.activeTriggers.has(name)) {
        continue
      }

      const targets = triggerTargets.get(name)
      if (!targets || targets.length === 0) {
        this.singletonServices.logger.info(
          `Trigger source '${name}' has no targets, skipping`
        )
        continue
      }

      try {
        const triggerInstance = await this.setupTriggerInstance(
          name,
          source.input,
          (data) => this.onTriggerFire(name, targets, data)
        )

        this.activeTriggers.set(name, triggerInstance)
        this.singletonServices.logger.info(`Started trigger: ${name}`)
      } catch (error) {
        this.singletonServices.logger.error(
          `Failed to start trigger ${name}: ${error}`
        )
      }
    }

    if (this.activeTriggers.size === 0) {
      this.singletonServices.logger.info(
        'No triggers started (no matching sources and targets found)'
      )
    }
  }
}
