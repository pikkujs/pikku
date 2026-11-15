/**
 * Bun dev server runner — `@pikku/bun-server` (native `Bun.serve` WebSockets).
 * Used when the CLI runs under Bun. The bun-server module is dynamically
 * imported so a node-run CLI never loads its bun-only code; types are pulled via
 * `import type` (erased at runtime).
 */

import type { Logger } from '@pikku/core/services'
import type * as BunServer from '@pikku/bun-server'

import type {
  DevServerRunner,
  DevServerInstance,
  DevServerConfig,
  DevServerOptions,
} from './dev-server-runner.interface.js'

export class BunServerRunner implements DevServerRunner {
  private mod?: typeof BunServer

  async prepare(): Promise<void> {
    this.mod = await import('@pikku/bun-server')
  }

  createServer(
    config: DevServerConfig,
    logger: Logger,
    options: DevServerOptions = {}
  ): DevServerInstance {
    if (!this.mod) {
      throw new Error('prepare() must be called before createServer()')
    }
    return new this.mod.PikkuBunServer(config, logger, {
      // Dropped here until now, which silently disabled signed asset reads for
      // every Bun project: `config.content` arrived, but the service that
      // verifies its signatures did not.
      contentSigningJWT: options.contentSigningJWT,
      // Read off this options object by the transport, not off `config` — so it
      // has to be forwarded here explicitly, exactly like the JWT above.
      mcpJson: options.mcpJson,
      mcpSurfaces: options.mcpSurfaces,
    })
  }
}
