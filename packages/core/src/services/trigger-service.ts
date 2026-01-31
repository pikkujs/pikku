import { CoreSingletonServices } from '../types/core.types.js'
import { setupTrigger } from '../wirings/trigger/trigger-runner.js'
import { TriggerInstance } from '../wirings/trigger/trigger.types.js'
import { ContextAwareRPCService } from '../wirings/rpc/rpc-runner.js'
import { pikkuState } from '../pikku-state.js'

/**
 * Simple concrete TriggerService.
 *
 * Reads both `wireTrigger` declarations and `wireTriggerSource` registrations
 * from pikkuState. Only starts triggers that have both a declaration and a source.
 * On fire, invokes target via `ContextAwareRPCService`.
 *
 * Single owner — one process runs triggers, no distributed claiming.
 *
 * @example
 * ```typescript
 * const triggerService = new TriggerService(singletonServices)
 * await triggerService.start()
 *
 * // On shutdown
 * await triggerService.stop()
 * ```
 */
export class TriggerService {
  private activeTriggers = new Map<string, TriggerInstance>()
  private rpcService: ContextAwareRPCService

  constructor(private singletonServices: CoreSingletonServices) {
    this.rpcService = new ContextAwareRPCService(
      singletonServices,
      {},
      { requiresAuth: false }
    )
  }

  /**
   * Start all triggers that have both a wireTrigger declaration and a wireTriggerSource.
   * Also starts triggers from workflow trigger wires.
   */
  async start(): Promise<void> {
    const triggers = pikkuState(null, 'trigger', 'triggers')
    const triggerSources = pikkuState(null, 'trigger', 'triggerSources')
    const workflowTriggerWires = pikkuState(null, 'workflows', 'wires').trigger

    // Build a map of trigger name -> targets (from wireTrigger declarations and workflow wires)
    const triggerTargets = new Map<
      string,
      Array<{
        targetType: 'rpc' | 'workflow'
        targetName: string
        startNode?: string
      }>
    >()

    // Add RPC targets from wireTrigger declarations (func-based)
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

    // Add workflow targets from workflows.wires.trigger state
    for (const [triggerName, targets] of Object.entries(workflowTriggerWires)) {
      if (!triggerTargets.has(triggerName)) {
        triggerTargets.set(triggerName, [])
      }
      for (const target of targets) {
        triggerTargets.get(triggerName)!.push({
          targetType: 'workflow',
          targetName: target.workflowName,
          startNode: target.startNode,
        })
      }
    }

    // Start triggers that have both a source and at least one target
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
        const triggerInstance = await setupTrigger({
          name,
          singletonServices: this.singletonServices,
          input: source.input,
          onTrigger: (data) => this.onTriggerFire(name, targets, data),
        })

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

  /**
   * Stop all trigger subscriptions
   */
  async stop(): Promise<void> {
    for (const [name, instance] of this.activeTriggers) {
      try {
        await instance.teardown()
        this.singletonServices.logger.info(`Stopped trigger: ${name}`)
      } catch (error) {
        this.singletonServices.logger.error(
          `Error stopping trigger ${name}: ${error}`
        )
      }
    }
    this.activeTriggers.clear()
  }

  /**
   * Handle trigger fire — invoke all registered targets
   */
  private async onTriggerFire(
    triggerName: string,
    targets: Array<{
      targetType: 'rpc' | 'workflow'
      targetName: string
      startNode?: string
    }>,
    data: unknown
  ): Promise<void> {
    for (const target of targets) {
      try {
        if (target.targetType === 'workflow') {
          await this.rpcService.startWorkflow(target.targetName, data, {
            startNode: target.startNode,
          })
          this.singletonServices.logger.info(
            `Trigger '${triggerName}' started workflow '${target.targetName}'`
          )
        } else {
          await this.rpcService.rpc(target.targetName, data)
          this.singletonServices.logger.info(
            `Trigger '${triggerName}' invoked RPC '${target.targetName}'`
          )
        }
      } catch (error) {
        this.singletonServices.logger.error(
          `Error invoking ${target.targetType} '${target.targetName}' from trigger '${triggerName}': ${error}`
        )
      }
    }
  }
}
