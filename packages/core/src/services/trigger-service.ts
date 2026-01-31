import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateWireServices,
} from '../types/core.types.js'
import { setupTrigger } from '../wirings/trigger/trigger-runner.js'
import { TriggerInstance } from '../wirings/trigger/trigger.types.js'
import { ContextAwareRPCService } from '../wirings/rpc/rpc-runner.js'
import { pikkuState } from '../pikku-state.js'

/**
 * Abstract TriggerService interface.
 *
 * Implementations manage trigger subscriptions — listening to external events
 * and dispatching to RPC targets or workflow starts.
 */
export abstract class TriggerService {
  /**
   * Set services needed for processing triggers.
   * Called after construction since the trigger service is created before
   * singletonServices are fully assembled.
   */
  setServices(
    _singletonServices: CoreSingletonServices,
    _createWireServices?: CreateWireServices<
      CoreSingletonServices,
      CoreServices,
      CoreUserSession
    >
  ): void {}

  /**
   * Start all triggers
   */
  async start(): Promise<void> {}

  /**
   * Stop all triggers
   */
  async stop(): Promise<void> {}
}

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
export class InMemoryTriggerService extends TriggerService {
  private activeTriggers = new Map<string, TriggerInstance>()
  private singletonServices?: CoreSingletonServices
  private rpcService?: ContextAwareRPCService

  /**
   * Set services needed for processing triggers.
   * Must be called before start().
   */
  setServices(
    singletonServices: CoreSingletonServices,
    _createWireServices?: CreateWireServices<
      CoreSingletonServices,
      CoreServices,
      CoreUserSession
    >
  ): void {
    this.singletonServices = singletonServices
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
    if (!this.singletonServices || !this.rpcService) {
      throw new Error(
        'InMemoryTriggerService requires singletonServices to start triggers'
      )
    }

    const triggers = pikkuState(null, 'trigger', 'triggers')
    const triggerSources = pikkuState(null, 'trigger', 'triggerSources')
    const workflowsMeta = pikkuState(null, 'workflows', 'meta')

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

    // Add workflow targets from workflows.meta trigger wires
    for (const [workflowName, wfMeta] of Object.entries(workflowsMeta)) {
      for (const t of wfMeta.wires?.trigger ?? []) {
        if (!triggerTargets.has(t.name)) {
          triggerTargets.set(t.name, [])
        }
        triggerTargets.get(t.name)!.push({
          targetType: 'workflow',
          targetName: workflowName,
          startNode: t.startNode,
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
        this.singletonServices!.logger.info(`Stopped trigger: ${name}`)
      } catch (error) {
        this.singletonServices!.logger.error(
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
          await this.rpcService!.startWorkflow(target.targetName, data, {
            startNode: target.startNode,
          })
          this.singletonServices!.logger.info(
            `Trigger '${triggerName}' started workflow '${target.targetName}'`
          )
        } else {
          await this.rpcService!.rpc(target.targetName, data)
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
