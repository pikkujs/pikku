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

import type { EventHubService } from '@pikku/core/channel'
import type { JWTService, Logger } from '@pikku/core/services'
import type { NodeHTTPServerConfig } from '@pikku/node-http-server'

export interface DevServerInstance {
  init(): Promise<void>
  start(): Promise<void>
  /** Full teardown — closes the server and any owned WebSocket server. */
  stop(): Promise<void>
  /**
   * The port the server actually bound, readable once `start()` has resolved.
   *
   * Diverges from the requested port whenever that was `0`, which is the only
   * race-free way for a parent process to hand the server a port: anything the
   * parent picks can be taken between its check and the server's bind. The
   * ready line is built from this, so a parent learns the port by reading it.
   */
  readonly port: number
}

/** Config shape both runtimes accept (Core config + host/port/content). */
export type DevServerConfig = NodeHTTPServerConfig

export type DevServerOptions = {
  /**
   * The JWTService the dev server's content service signs asset URLs with.
   * The transport verifies signed asset reads with it, so it must be the same
   * instance — otherwise every signed URL is rejected.
   */
  contentSigningJWT?: JWTService
  /**
   * The generated MCP manifest. Handed straight to the transport, which mounts
   * the MCP endpoint only when it is present — so a runner that forgets to
   * forward this serves a 404 with no error anywhere.
   */
  mcpJson?: {
    tools?: unknown[]
    resources?: unknown[]
    prompts?: unknown[]
  }
}

export interface DevServerRunner {
  /**
   * Create the EventHub for this runtime. Shared into singleton services so
   * function-side broadcasts reach the transport's sockets. Must be called
   * once before `createServer`.
   */
  createEventHub(): Promise<EventHubService<any>>
  /** Create the dev HTTP/WS server. Must be called after `createEventHub`. */
  createServer(
    config: DevServerConfig,
    logger: Logger,
    options?: DevServerOptions
  ): DevServerInstance
}
