import {
  CoreSingletonServices,
  CreateWireServices,
  CoreServices,
  CoreUserSession,
} from '../types/core.types.js'

/**
 * Abstract TriggerService interface.
 *
 * Implementations manage trigger subscriptions — listening to external events
 * and dispatching to RPC targets or workflow starts.
 */
export interface TriggerService {
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
  ): void

  /**
   * Start all triggers
   */
  start(): Promise<void>

  /**
   * Stop all triggers
   */
  stop(): Promise<void>
}
