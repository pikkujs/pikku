import {
  CoreSingletonServices,
  CreateWireServices,
  CoreServices,
  CoreUserSession,
} from '../../types/core.types.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { setupTrigger } from './trigger-runner.js'
import { TriggerInstance } from './trigger.types.js'
import { TriggerService } from '../../services/trigger-service.js'
import { pikkuState } from '../../pikku-state.js'

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
  protected singletonServices?: CoreSingletonServices
  protected createWireServices?: CreateWireServices<
    CoreSingletonServices,
    CoreServices,
    CoreUserSession
  >

  setServices(
    singletonServices: CoreSingletonServices,
    createWireServices?: CreateWireServices<
      CoreSingletonServices,
      CoreServices,
      CoreUserSession
    >
  ): void {
    this.singletonServices = singletonServices
    this.createWireServices = createWireServices
  }

  abstract start(): Promise<void>

  async stop(): Promise<void> {
    for (const [name, instance] of this.activeTriggers) {
      try {
        await instance.teardown()
        this.singletonServices!.logger.info(`Stopped trigger: ${name}`)
      } catch (error) {
        this.singletonServices!.logger.error(
          `Error stopping trigger ${name}: ${error}`
        )
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
          targetName: meta.pikkuFuncName,
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
      singletonServices: this.singletonServices!,
      createWireServices: this.createWireServices as any,
      input,
      onTrigger,
    })
  }

  protected async onTriggerFire(
    triggerName: string,
    targets: TriggerTarget[],
    data: unknown
  ): Promise<void> {
    const wireServices = await this.createWireServices?.(
      this.singletonServices!,
      {}
    )
    const services = { ...this.singletonServices!, ...wireServices }
    const rpc = rpcService.getContextRPCService(services, {}, false)

    for (const target of targets) {
      try {
        if (target.targetType === 'workflow') {
          await rpc.startWorkflow(target.targetName, data, {
            startNode: target.startNode,
          })
          this.singletonServices!.logger.info(
            `Trigger '${triggerName}' started workflow '${target.targetName}'`
          )
        } else {
          await rpc.invoke(target.targetName, data)
          this.singletonServices!.logger.info(
            `Trigger '${triggerName}' invoked RPC '${target.targetName}'`
          )
        }
      } catch (error) {
        this.singletonServices!.logger.error(
          `Error invoking ${target.targetType} '${target.targetName}' from trigger '${triggerName}': ${error}`
        )
      }
    }
  }
}
