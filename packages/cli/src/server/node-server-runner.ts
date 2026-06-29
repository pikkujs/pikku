/**
 * Node dev server runner — `@pikku/node-http-server` + the `ws` WebSocketServer.
 * Used when the CLI runs under Node. Owns the WebSocketServer so teardown
 * (close ws then the http server) is encapsulated in the returned instance.
 */

import type { EventHubService } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import { LocalEventHubService } from '@pikku/core/channel/local'
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'
import { pikkuWebsocketHandler } from '@pikku/ws'
import { WebSocketServer } from 'ws'

import type {
  DevServerRunner,
  DevServerInstance,
  DevServerConfig,
} from './dev-server-runner.interface.js'

export class NodeServerRunner implements DevServerRunner {
  async createEventHub(): Promise<EventHubService<any>> {
    return new LocalEventHubService()
  }

  createServer(config: DevServerConfig, logger: Logger): DevServerInstance {
    const wss = new WebSocketServer({ noServer: true })
    const server = new PikkuNodeHTTPServer(config, logger, {
      configureServer: (httpServer) => {
        pikkuWebsocketHandler({ server: httpServer, wss, logger })
      },
    })
    return {
      init: () => server.init(),
      start: () => server.start(),
      stop: async () => {
        await new Promise<void>((resolve, reject) =>
          wss.close((err) => (err ? reject(err) : resolve()))
        )
        await server.stop()
      },
    }
  }
}
