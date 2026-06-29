/**
 * Dev server runner abstraction.
 *
 * The `pikku dev` server differs by runtime: under Node it's
 * `@pikku/node-http-server` + the `ws` WebSocketServer; under Bun it's
 * `@pikku/bun-server` (native `Bun.serve` WebSockets). Both also supply the
 * EventHub that is shared into singleton services so function-side broadcasts
 * reach the transport's sockets. The right runner is resolved once in
 * `services.ts` and injected — no `typeof Bun` checks in the dev command.
 */

import type { EventHubService } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import type { NodeHTTPServerConfig } from '@pikku/node-http-server'

export interface DevServerInstance {
  init(): Promise<void>
  start(): Promise<void>
  /** Full teardown — closes the server and any owned WebSocket server. */
  stop(): Promise<void>
}

/** Config shape both runtimes accept (Core config + host/port/content). */
export type DevServerConfig = NodeHTTPServerConfig

export interface DevServerRunner {
  /**
   * Create the EventHub for this runtime. Shared into singleton services so
   * function-side broadcasts reach the transport's sockets. Must be called
   * once before `createServer`.
   */
  createEventHub(): Promise<EventHubService<any>>
  /** Create the dev HTTP/WS server. Must be called after `createEventHub`. */
  createServer(config: DevServerConfig, logger: Logger): DevServerInstance
}
