import { CoreSingletonServices } from '../types/core.types.js'
import { setupTrigger } from '../wirings/trigger/trigger-runner.js'
import { TriggerInstance } from '../wirings/trigger/trigger.types.js'
import { ContextAwareRPCService } from '../wirings/rpc/rpc-runner.js'
import { pikkuState } from '../pikku-state.js'

/**
 * Generate a deterministic hash for trigger input
 * Used to create unique keys for trigger+input combinations
 */
export const generateInputHash = (input: unknown): string => {
  const inputStr = JSON.stringify(input)
  let hash = 0
  for (let i = 0; i < inputStr.length; i++) {
    const char = inputStr.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * Target for a trigger - either an RPC function or a workflow
 */
export interface TriggerTarget {
  rpc?: string
  workflow?: string
}

/**
 * Options for registering a trigger target
 */
export interface RegisterOptions<TInput = unknown> {
  trigger: string
  input: TInput
  target: TriggerTarget
}

/**
 * A trigger registration stored in the database
 */
export interface TriggerRegistration {
  triggerName: string
  inputHash: string
  inputData: unknown
  targetType: 'rpc' | 'workflow'
  targetName: string
}

/**
 * A unique trigger instance (trigger name + input combination)
 */
export interface TriggerInputInstance {
  triggerName: string
  inputHash: string
  inputData: unknown
}

/**
 * An active trigger subscription managed by this service
 */
interface ActiveTrigger {
  name: string
  inputHash: string
  input: unknown
  instance: TriggerInstance
}

/**
 * Abstract base class for TriggerService implementations.
 *
 * Handles the orchestration of trigger lifecycle:
 * - Registering trigger → target associations
 * - Starting/stopping trigger subscriptions with distributed claiming
 * - Firing triggers and invoking all registered targets
 *
 * Concrete implementations (Postgres, Redis) handle the storage layer.
 *
 * @example
 * ```typescript
 * const triggerService = new PgTriggerService(singletonServices)
 *
 * // Register targets for a trigger
 * await triggerService.register({
 *   trigger: 'redis-subscribe',
 *   input: { channel: 'my-channel' },
 *   target: { rpc: 'processMessage' }
 * })
 *
 * // Start all trigger subscriptions
 * await triggerService.start()
 *
 * // On shutdown
 * await triggerService.stop()
 * ```
 */
export abstract class TriggerService {
  protected activeTriggers = new Map<string, ActiveTrigger>()
  protected heartbeatInterval: ReturnType<typeof setInterval> | null = null
  protected processId: string
  protected rpcService: ContextAwareRPCService

  constructor(protected singletonServices: CoreSingletonServices) {
    this.processId = `${process.pid}-${Date.now()}`
    this.rpcService = new ContextAwareRPCService(
      singletonServices as any,
      {},
      { requiresAuth: false }
    )
  }

  // ============================================
  // Abstract methods - implemented by backends
  // ============================================

  /**
   * Store a trigger → target registration in the database
   */
  protected abstract storeRegistration(
    registration: TriggerRegistration
  ): Promise<void>

  /**
   * Remove a trigger → target registration from the database
   */
  protected abstract removeRegistration(
    registration: TriggerRegistration
  ): Promise<void>

  /**
   * Get all unique trigger+input combinations from the database
   * Optionally filtered to only triggers this process supports
   */
  protected abstract getDistinctTriggerInputs(
    supportedTriggers?: string[]
  ): Promise<TriggerInputInstance[]>

  /**
   * Get all targets registered for a specific trigger+input
   */
  protected abstract getTargetsForTrigger(
    triggerName: string,
    inputHash: string
  ): Promise<Array<{ targetType: 'rpc' | 'workflow'; targetName: string }>>

  /**
   * Attempt to claim a trigger instance for this process.
   * Should be atomic - only succeeds if unclaimed or expired.
   * @returns true if claim succeeded, false otherwise
   */
  protected abstract tryClaimInstance(
    triggerName: string,
    inputHash: string,
    inputData: unknown
  ): Promise<boolean>

  /**
   * Release a claimed trigger instance
   */
  protected abstract releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void>

  /**
   * Update heartbeat for all instances claimed by this process
   */
  protected abstract updateHeartbeat(): Promise<void>

  // ============================================
  // Public API
  // ============================================

  /**
   * Register a trigger → target association (stored in DB)
   * A trigger+input can have multiple targets (RPCs or workflows)
   */
  async register<TInput>(options: RegisterOptions<TInput>): Promise<void> {
    const inputHash = generateInputHash(options.input)
    const targetType = options.target.workflow ? 'workflow' : 'rpc'
    const targetName = options.target.workflow ?? options.target.rpc

    if (!targetName) {
      throw new Error('Target must specify either rpc or workflow')
    }

    await this.storeRegistration({
      triggerName: options.trigger,
      inputHash,
      inputData: options.input,
      targetType,
      targetName,
    })

    this.singletonServices.logger.info(
      `Registered ${targetType} target '${targetName}' for trigger '${options.trigger}'`
    )
  }

  /**
   * Unregister a specific target from a trigger
   */
  async unregister<TInput>(options: RegisterOptions<TInput>): Promise<void> {
    const inputHash = generateInputHash(options.input)
    const targetType = options.target.workflow ? 'workflow' : 'rpc'
    const targetName = options.target.workflow ?? options.target.rpc

    if (!targetName) {
      throw new Error('Target must specify either rpc or workflow')
    }

    await this.removeRegistration({
      triggerName: options.trigger,
      inputHash,
      inputData: options.input,
      targetType,
      targetName,
    })

    this.singletonServices.logger.info(
      `Unregistered ${targetType} target '${targetName}' from trigger '${options.trigger}'`
    )
  }

  /**
   * Start claiming and running triggers this process supports.
   *
   * - Gets supported triggers from pikkuState (what's been wired)
   * - Queries DB for trigger instances we can handle
   * - Attempts to claim each (with heartbeat-based distributed locking)
   * - Starts subscriptions for claimed triggers
   */
  async start(): Promise<void> {
    // Get trigger names this process has wired
    const supported = Array.from(pikkuState(null, 'trigger', 'triggers').keys())

    if (supported.length === 0) {
      this.singletonServices.logger.info('No triggers wired, nothing to start')
      return
    }

    // Query for trigger instances we support
    const instances = await this.getDistinctTriggerInputs(supported)

    for (const instance of instances) {
      const key = `${instance.triggerName}:${instance.inputHash}`

      if (this.activeTriggers.has(key)) {
        continue
      }

      // Attempt to claim this instance
      const claimed = await this.tryClaimInstance(
        instance.triggerName,
        instance.inputHash,
        instance.inputData
      )

      if (claimed) {
        await this.startSubscription(instance)
      }
    }

    // Start heartbeat interval
    if (this.activeTriggers.size > 0 && !this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => this.heartbeat(), 10_000)
    }
  }

  /**
   * Stop all trigger subscriptions and release claims
   */
  async stop(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    // Teardown all active triggers and release claims
    for (const [key, trigger] of this.activeTriggers) {
      try {
        await trigger.instance.teardown()
        await this.releaseInstance(trigger.name, trigger.inputHash)
        this.singletonServices.logger.info(`Stopped trigger: ${key}`)
      } catch (error) {
        this.singletonServices.logger.error(
          `Error stopping trigger ${key}: ${error}`
        )
      }
    }

    this.activeTriggers.clear()
  }

  // ============================================
  // Internal methods
  // ============================================

  /**
   * Start a subscription for a claimed trigger instance
   */
  private async startSubscription(
    instance: TriggerInputInstance
  ): Promise<void> {
    const key = `${instance.triggerName}:${instance.inputHash}`

    try {
      const triggerInstance = await setupTrigger({
        name: instance.triggerName,
        singletonServices: this.singletonServices,
        input: instance.inputData,
        onTrigger: (data) =>
          this.onTriggerFire(instance.triggerName, instance.inputHash, data),
      })

      this.activeTriggers.set(key, {
        name: instance.triggerName,
        inputHash: instance.inputHash,
        input: instance.inputData,
        instance: triggerInstance,
      })

      this.singletonServices.logger.info(`Started trigger: ${key}`)
    } catch (error) {
      this.singletonServices.logger.error(
        `Failed to start trigger ${key}: ${error}`
      )
      // Release claim if we failed to start
      await this.releaseInstance(instance.triggerName, instance.inputHash)
    }
  }

  /**
   * Heartbeat to keep claims alive
   */
  private async heartbeat(): Promise<void> {
    try {
      await this.updateHeartbeat()
    } catch (error) {
      this.singletonServices.logger.error(`Heartbeat failed: ${error}`)
    }
  }

  /**
   * Handle trigger fire - query DB for targets and invoke them
   */
  private async onTriggerFire(
    triggerName: string,
    inputHash: string,
    data: unknown
  ): Promise<void> {
    const targets = await this.getTargetsForTrigger(triggerName, inputHash)

    for (const target of targets) {
      try {
        if (target.targetType === 'workflow') {
          await this.rpcService.startWorkflow(target.targetName, data)
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
