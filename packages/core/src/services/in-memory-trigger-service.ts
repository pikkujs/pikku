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
 * const triggerService = new InMemoryTriggerService(singletonServices.logger)
 * triggerService.setPikkuFunctionRunner(runFunction)
 * await triggerService.start()
 *
 * // On shutdown
 * await triggerService.stop()
 * ```
 */
export class InMemoryTriggerService extends PikkuTriggerService {
  async start(): Promise<void> {
    this.getRunFunction()

    const triggerTargets = this.getTriggerTargets()
    const triggerSources = this.getTriggerSources()

    for (const [name, source] of triggerSources) {
      if (this.activeTriggers.has(name)) {
        continue
      }

      const targets = triggerTargets.get(name)
      if (!targets || targets.length === 0) {
        this.logger.info(`Trigger source '${name}' has no targets, skipping`)
        continue
      }

      try {
        const triggerInstance = await this.setupTriggerInstance(
          name,
          source.input,
          (data) => this.onTriggerFire(name, targets, data)
        )

        this.activeTriggers.set(name, triggerInstance)
        this.logger.info(`Started trigger: ${name}`)
      } catch (error) {
        this.logger.error(`Failed to start trigger ${name}: ${error}`)
      }
    }

    if (this.activeTriggers.size === 0) {
      this.logger.info(
        'No triggers started (no matching sources and targets found)'
      )
    }
  }
}
