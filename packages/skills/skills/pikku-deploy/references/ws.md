# ws (WebSocket only)

`@pikku/ws` connects Pikku's channel system to a Node.js WebSocket server built
on the [ws](https://github.com/websockets/ws) library. Use it for a
WebSocket-only server; for HTTP and WebSocket on one port see `uws.md`, and when
the WebSocket server shares a port with an existing HTTP app see `express.md` or
`fastify.md`.

```bash
yarn add @pikku/ws ws
```

The package exports one function, `pikkuWebsocketHandler` — there is no server
class. You own the `http.Server` and the `WebSocketServer`; the handler attaches
the upgrade and message plumbing to them.

```typescript
import { DEFAULT_WS_MAX_PAYLOAD, pikkuWebsocketHandler } from '@pikku/ws'
import { stopSingletonServices } from '@pikku/core'
import { Server } from 'http'
import { WebSocketServer } from 'ws'

import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const server = new Server()
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: DEFAULT_WS_MAX_PAYLOAD,
})

pikkuWebsocketHandler({
  server,
  wss,
  logger: singletonServices.logger,
  logRoutes: true, // print the wired channels at startup
  loadSchemas: true, // compile input schemas up front
})

server.listen(4002, 'localhost')

process.on('SIGINT', async () => {
  await stopSingletonServices()
  wss.close()
  server.close()
  process.exit(0)
})
```

## `noServer: true` is required, not stylistic

The handler listens for the HTTP server's own `upgrade` event, opens the channel
— running Pikku's middleware chain, auth and CORS against the upgrade request
first — and only then calls `wss.handleUpgrade`. A `WebSocketServer` bound to the
server directly would take the socket before any of that ran.

An upgrade the channel rejects gets the socket destroyed, and an auth failure is
written as a real HTTP response on the raw socket rather than a silent drop.

## Services and the event hub

Services come from the bootstrap import and the global singleton registry, which
is why nothing is passed in. The event hub is taken from
`singletonServices.eventHub` when it is a `LocalEventHubService`, and a local one
is created otherwise — so a single-process app gets pub/sub for free, while a
multi-instance deployment must register a distributed hub.

The options type also extends `RunHTTPWiringOptions`, so per-request settings
such as `respondWith404`, `coerceDataFromSchema` and `bubbleErrors` are accepted
here too.

On shutdown, call `stopSingletonServices()` then close `wss` and `server`.
