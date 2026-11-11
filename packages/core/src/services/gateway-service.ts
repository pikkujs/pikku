/**
 * Starts and stops the listener gateways (long-lived connections such as a
 * chat-platform socket) registered with `wireGateway`. {@link
 * LocalGatewayService} runs them in the current process.
 */
export interface GatewayService {
  start(): Promise<void>

  stop(): Promise<void>
}
