import type { GatewayService } from './gateway-service.js'
import type { GatewayAdapter } from '../wirings/gateway/gateway.types.js'
import { pikkuState, getSingletonServices } from '../pikku-state.js'
import { createListenerMessageHandler } from '../wirings/gateway/gateway-runner.js'

/**
 * Local GatewayService implementation.
 *
 * Starts all registered listener gateways unconditionally (single-process).
 * For distributed deployments, implement `GatewayService` with leader
 * election or similar coordination.
 *
 * @example
 * ```typescript
 * const gatewayService = new LocalGatewayService()
 * await gatewayService.start()
 *
 * // On shutdown
 * await gatewayService.stop()
 * ```
 */
export class LocalGatewayService implements GatewayService {
  private activeAdapters = new Map<string, GatewayAdapter>()

  async start(): Promise<void> {
    const singletonServices = getSingletonServices()
    const gateways = pikkuState(null, 'gateway', 'gateways')

    for (const [name, config] of gateways) {
      if (config.type !== 'listener') continue
      if (this.activeAdapters.has(name)) continue

      const handleMessage = createListenerMessageHandler(
        name,
        config,
        singletonServices
      )

      await config.adapter.init(handleMessage)
      this.activeAdapters.set(name, config.adapter)
      singletonServices.logger.info(`Started listener gateway: ${name}`)
    }
  }

  async stop(): Promise<void> {
    for (const [name, adapter] of this.activeAdapters) {
      try {
        await adapter.close()
      } catch (e: any) {
        try {
          getSingletonServices().logger.error(
            `Error closing listener gateway '${name}':`,
            e
          )
        } catch {
          // logger may not be available during shutdown
        }
      }
    }
    this.activeAdapters.clear()
  }
}
