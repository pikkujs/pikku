import { PikkuTriggerService } from '../wirings/trigger/pikku-trigger-service.js'
import { getSingletonServices } from '../pikku-state.js'

// knowledge: decisions/internals/local-trigger-and-gateway-services-assume-a-single-process.md
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
          (data) => this.onTriggerFire(name, targets, data)
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
