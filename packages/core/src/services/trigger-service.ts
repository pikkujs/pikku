/**
 * Abstract TriggerService interface.
 *
 * Implementations manage trigger subscriptions — listening to external events
 * and dispatching to RPC targets or workflow starts.
 */
export interface TriggerService {
  /**
   * Start all triggers
   */
  start(): Promise<void>

  /**
   * Stop all triggers
   */
  stop(): Promise<void>
}
