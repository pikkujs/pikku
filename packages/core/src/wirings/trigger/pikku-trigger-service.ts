import { rpcService } from '../rpc/rpc-runner.js'
import { setupTrigger } from './trigger-runner.js'
import { TriggerInstance } from './trigger.types.js'
import { TriggerService } from '../../services/trigger-service.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../pikku-state.js'

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

  abstract start(): Promise<void>

  async stop(): Promise<void> {
    const singletonServices = getSingletonServices()
    for (const [name, instance] of this.activeTriggers) {
      try {
        await instance.teardown()
        singletonServices.logger.info(`Stopped trigger: ${name}`)
      } catch (error) {
        singletonServices.logger.error(
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
      singletonServices: getSingletonServices(),
      createWireServices: getCreateWireServices() as any,
      input,
      onTrigger,
    })
  }

  protected async onTriggerFire(
    triggerName: string,
    targets: TriggerTarget[],
    data: unknown
  ): Promise<void> {
    const singletonServices = getSingletonServices()
    const createWireServices = getCreateWireServices()
    const wireServices = await createWireServices?.(singletonServices, {})
    const services = { ...singletonServices, ...wireServices }
    const rpc = rpcService.getContextRPCService(services, {}, false)

    for (const target of targets) {
      try {
        if (target.targetType === 'workflow') {
          await rpc.startWorkflow(target.targetName, data, {
            startNode: target.startNode,
          })
          singletonServices.logger.info(
            `Trigger '${triggerName}' started workflow '${target.targetName}'`
          )
        } else {
          await rpc.invoke(target.targetName, data)
          singletonServices.logger.info(
            `Trigger '${triggerName}' invoked RPC '${target.targetName}'`
          )
        }
      } catch (error) {
        singletonServices.logger.error(
          `Error invoking ${target.targetType} '${target.targetName}' from trigger '${triggerName}': ${error}`
        )
      }
    }
  }
}
