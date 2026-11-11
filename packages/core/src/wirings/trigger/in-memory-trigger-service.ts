import { PikkuTriggerService } from './pikku-trigger-service.js'
import { getSingletonServices } from '../../pikku-state.js'

// knowledge: decisions/internals/local-trigger-and-gateway-services-assume-a-single-process.md
/**
 * Runs every wired trigger source in this process. `start` sets up each source
 * that has at least one `wireTrigger` listening and logs, rather than throws, a
 * source that fails to start; `stop` tears them all down.
 *
 * Single-process only: a second instance would start every source again.
 */
export class InMemoryTriggerService extends PikkuTriggerService {
  async start(): Promise<void> {
    const singletonServices = getSingletonServices()

    const triggerTargets = this.getTriggerTargets()
    const triggerSources = this.getTriggerSources()

    for (const [name, source] of triggerSources) {
      if (this.activeTriggers.has(name)) {
        continue
      }

      const targets = triggerTargets.get(name)
      if (!targets || targets.length === 0) {
        singletonServices.logger.info(
          `Trigger source '${name}' has no targets, skipping`
        )
        continue
      }

      try {
        const triggerInstance = await this.setupTriggerInstance(
          name,
          source.input,
          (data, options) => this.onTriggerFire(name, targets, data, options)
        )

        this.activeTriggers.set(name, triggerInstance)
        singletonServices.logger.info(`Started trigger: ${name}`)
      } catch (error) {
        singletonServices.logger.error(
          `Failed to start trigger ${name}: ${error}`
        )
      }
    }

    if (this.activeTriggers.size === 0) {
      singletonServices.logger.info(
        'No triggers started (no matching sources and targets found)'
      )
    }
  }
}
