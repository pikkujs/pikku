import type { Logger } from '../../services/logger.js'
import { setupTrigger } from './trigger-runner.js'
import { TriggerInstance } from './trigger.types.js'
import { TriggerService } from '../../services/trigger-service.js'
import { pikkuState } from '../../pikku-state.js'
import { type RunFunction } from '../../function/function-runner.js'

export type TriggerTarget = {
  targetType: 'rpc' | 'workflow'
  targetName: string
  startNode?: string
}

export type TriggerSourceInfo = {
  name: string
  input: unknown
}

export abstract class PikkuTriggerService implements TriggerService {
  protected activeTriggers = new Map<string, TriggerInstance>()
  protected logger: Logger
  protected runFunction?: RunFunction

  constructor(logger: Logger) {
    this.logger = logger
  }

  setPikkuFunctionRunner(runFunction: RunFunction): void {
    this.runFunction = runFunction
  }

  abstract start(): Promise<void>

  async stop(): Promise<void> {
    for (const [name, instance] of this.activeTriggers) {
      try {
        await instance.teardown()
        this.logger.info(`Stopped trigger: ${name}`)
      } catch (error) {
        this.logger.error(`Error stopping trigger ${name}: ${error}`)
      }
    }
    this.activeTriggers.clear()
  }

  protected getTriggerTargets(): Map<string, TriggerTarget[]> {
    const triggers = pikkuState(null, 'trigger', 'triggers')

    const triggerTargets = new Map<string, TriggerTarget[]>()

    for (const [name] of triggers) {
      const meta = pikkuState(null, 'trigger', 'meta')[name]
      if (meta) {
        if (!triggerTargets.has(name)) {
          triggerTargets.set(name, [])
        }
        triggerTargets.get(name)!.push({
          targetType: 'rpc',
          targetName: meta.pikkuFuncId,
        })
      }
    }

    return triggerTargets
  }

  protected getTriggerSources(): Map<string, { input?: unknown }> {
    return pikkuState(null, 'trigger', 'triggerSources')
  }

  protected async setupTriggerInstance(
    name: string,
    input: unknown,
    onTrigger: (data: unknown) => Promise<void>
  ): Promise<TriggerInstance> {
    return setupTrigger({
      name,
      runFunction: this.getRunFunction(),
      logger: this.logger,
      input,
      onTrigger,
    })
  }

  protected async onTriggerFire(
    triggerName: string,
    targets: TriggerTarget[],
    data: unknown
  ): Promise<void> {
    const runFunction = this.getRunFunction()

    for (const target of targets) {
      try {
        await runFunction(
          target.targetType === 'workflow' ? 'workflow' : 'rpc',
          target.targetName,
          target.targetName,
          {
            auth: false,
            data: () => data,
            wire: {},
          }
        )
        this.logger.info(
          `Trigger '${triggerName}' invoked ${target.targetType} '${target.targetName}'`
        )
      } catch (error) {
        this.logger.error(
          `Error invoking ${target.targetType} '${target.targetName}' from trigger '${triggerName}': ${error}`
        )
      }
    }
  }

  protected getRunFunction(): RunFunction {
    if (!this.runFunction) {
      throw new Error(
        'TriggerService requires setPikkuFunctionRunner() before start()'
      )
    }
    return this.runFunction
  }
}
