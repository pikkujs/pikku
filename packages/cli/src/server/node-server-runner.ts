/**
 * Node dev server runner — `@pikku/node-http-server` + the `ws` WebSocketServer.
 * Used when the CLI runs under Node. Owns the WebSocketServer so teardown
 * (close ws then the http server) is encapsulated in the returned instance.
 *
 * `@pikku/ws` and `ws` are optional peers of the CLI, so they are imported
 * dynamically and resolved from the *project* rather than from the CLI: both
 * peer on `@pikku/core`, and a copy loaded out of the CLI's own tree is paired
 * with the CLI's core instead of the project's. A project without them served
 * over plain HTTP — `pikku validate` reports the missing packages.
 */

import type { EventHubService } from '@pikku/core/channel'
import type { Logger } from '@pikku/core/services'
import { LocalEventHubService } from '@pikku/core/channel/local'
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'
import type * as PikkuWs from '@pikku/ws'
import type * as Ws from 'ws'

import { cjsInterop, importFromProject } from '../utils/resolve-from-project.js'
import type {
  DevServerRunner,
  DevServerInstance,
  DevServerConfig,
  DevServerOptions,
} from './dev-server-runner.interface.js'

export const WEBSOCKET_PACKAGES_MISSING =
  'WebSocket support is disabled: @pikku/ws and ws are not installed in this project. Install them (npm install @pikku/ws ws) to serve channels over Node.'

export class NodeServerRunner implements DevServerRunner {
  private pikkuWs?: typeof PikkuWs
  private ws?: typeof Ws

  constructor(private readonly rootDir: string) {}

  async createEventHub(): Promise<EventHubService<any>> {
    this.pikkuWs = await importFromProject<typeof PikkuWs>(
      this.rootDir,
      '@pikku/ws'
    )
    const ws = await importFromProject<typeof Ws>(this.rootDir, 'ws')
    this.ws = ws && cjsInterop(ws, 'WebSocketServer')
    return new LocalEventHubService()
  }

  createServer(
    config: DevServerConfig,
    logger: Logger,
    options: DevServerOptions = {}
  ): DevServerInstance {
    const { pikkuWs, ws } = this
    if (!pikkuWs || !ws) {
      logger.warn(WEBSOCKET_PACKAGES_MISSING)
    }
    const wss =
      pikkuWs && ws
        ? new ws.WebSocketServer({
            noServer: true,
            maxPayload: pikkuWs.DEFAULT_WS_MAX_PAYLOAD,
          })
        : undefined
    const server = new PikkuNodeHTTPServer(config, logger, {
      configureServer: (httpServer) => {
        if (pikkuWs && wss) {
          pikkuWs.pikkuWebsocketHandler({ server: httpServer, wss, logger })
        }
      },
      contentSigningJWT: options.contentSigningJWT,
      // Read off this options object by the transport, not off `config` — so it
      // has to be forwarded here explicitly, exactly like the JWT above.
      mcpJson: options.mcpJson,
    })
    return {
      init: () => server.init(),
      start: () => server.start(),
      get port() {
        return server.port
      },
      stop: async () => {
        if (wss) {
          await new Promise<void>((resolve, reject) =>
            wss.close((err) => (err ? reject(err) : resolve()))
          )
        }
        await server.stop()
      },
    }
  }
}
