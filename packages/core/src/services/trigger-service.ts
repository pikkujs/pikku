import type { RunFunction } from '../function/function-runner.js'

/**
 * Abstract TriggerService interface.
 *
 * Implementations manage trigger subscriptions — listening to external events
 * and dispatching to RPC targets or workflow starts.
 */
export interface TriggerService {
  setPikkuFunctionRunner(_runFunction: RunFunction): void

  /**
   * Start all triggers
   */
  start(): Promise<void>

  /**
   * Stop all triggers
   */
  stop(): Promise<void>
}
