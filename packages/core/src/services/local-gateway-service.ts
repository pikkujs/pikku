import type { GatewayService } from './gateway-service.js'
import type { GatewayAdapter } from '../wirings/gateway/gateway.types.js'
import { pikkuState, getSingletonServices } from '../pikku-state.js'
import {
  createListenerMessageHandler,
  resolveGatewayAdapter,
} from '../wirings/gateway/gateway-runner.js'

// knowledge: decisions/internals/local-trigger-and-gateway-services-assume-a-single-process.md
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

      const adapter = await resolveGatewayAdapter(config, singletonServices)
      await adapter.init(handleMessage)
      this.activeAdapters.set(name, adapter)
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
          // The logger may already be gone during shutdown.
        }
      }
    }
    this.activeAdapters.clear()
  }
}
