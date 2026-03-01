/**
 * Abstract GatewayService interface.
 *
 * Implementations manage listener gateway lifecycle — initializing adapters
 * and delivering messages to handler functions.
 *
 * A `LocalGatewayService` starts all listeners unconditionally;
 * a distributed implementation could check leader election first.
 */
export interface GatewayService {
  /**
   * Start all listener gateways
   */
  start(): Promise<void>

  /**
   * Stop all listener gateways
   */
  stop(): Promise<void>
}
