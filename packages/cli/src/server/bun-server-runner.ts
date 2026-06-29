/**
 * Bun dev server runner — `@pikku/bun-server` (native `Bun.serve` WebSockets).
 * Used when the CLI runs under Bun. The bun-server module is dynamically
 * imported so a node-run CLI never loads its bun-only code; types are pulled via
 * `import type` (erased at runtime). The same BunEventHubService instance is
 * shared with singleton services so function-side broadcasts reach the sockets
 * the transport holds.
 */

import type { EventHubService } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import type { BunEventHubService } from '@pikku/bun-server'

import type {
  DevServerRunner,
  DevServerInstance,
  DevServerConfig,
} from './dev-server-runner.interface.js'

export class BunServerRunner implements DevServerRunner {
  private mod?: typeof import('@pikku/bun-server')
  private eventHub?: BunEventHubService

  async createEventHub(): Promise<EventHubService<any>> {
    this.mod = await import('@pikku/bun-server')
    this.eventHub = new this.mod.BunEventHubService()
    return this.eventHub
  }

  createServer(config: DevServerConfig, logger: Logger): DevServerInstance {
    if (!this.mod || !this.eventHub) {
      throw new Error('createEventHub() must be called before createServer()')
    }
    return new this.mod.PikkuBunServer(config, logger, {
      eventHub: this.eventHub,
    })
  }
}
