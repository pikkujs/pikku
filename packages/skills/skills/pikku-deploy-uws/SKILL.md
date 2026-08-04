---
name: pikku-deploy-uws
description: >-
  Use when deploying a Pikku app with uWebSockets.js. Covers PikkuUWSServer with built-in HTTP and
  WebSocket support, and pikkuWebsocketHandler for standalone ws library. TRIGGER when: code
  imports @pikku/uws or @pikku/ws, user mentions uWebSockets or high-performance server, or
  start.ts creates a PikkuUWSServer. DO NOT TRIGGER when: just defining functions/wirings without
  uWS-specific code.
---

# Pikku uWebSockets.js Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Highest-throughput option among Pikku's runtimes. Handles both HTTP and WebSocket automatically.

```bash
yarn add @pikku/uws
```

```typescript
import { PikkuUWSServer } from '@pikku/uws'
import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const appServer = new PikkuUWSServer(
  { ...config, hostname: 'localhost', port: 4002 },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

**Constructor:** `new PikkuUWSServer(config, logger)`

**Config extends CoreConfig with:** `port`, `hostname`, `healthCheckPath?`

**Methods:** `init(httpOptions?: RunHTTPWiringOptions)`, `start()`, `stop()`, `enableExitOnSigInt()`

**Property:** `app: uWS.App` — Direct access to uWebSockets app instance.

### What the server does and does not give you

`init()` registers three things in order: the health check (`healthCheckPath`,
default `/health-check`), a catch-all `app.any('/*')` HTTP handler, and a
catch-all `app.ws('/*')` websocket handler. Nothing is registered by the
constructor, so nothing answers before `init` runs.

**There is no `enableCors`, no static assets and no `content` support** — unlike
the Express server. The class is explicitly a prototyping convenience; for
anything that needs extra handlers, use `@pikku/uws-handler` directly and treat
`pikku-uws-server.ts` as the template (that is what its own JSDoc says).

`httpOptions` reaches the HTTP handler only. The websocket handler is
constructed with a fixed `{ logger, logRoutes: true }`, so per-request options
do not apply to the upgrade path. `loadSchemas` is also never passed by the
server, so schemas compile lazily on first use rather than at startup — pass
`loadSchemas: true` in `httpOptions` if you want the startup cost paid up front.

`stop()` closes the listen socket and then waits a fixed 2 seconds for
connections to drain. Called before `start()`, it throws a bare **string**, not
an `Error`, so `catch (e) { e.message }` reads `undefined`.

### Body limits

uWS hands over raw chunks with no limit of its own, so the handler counts the
bytes itself. A request over `maxBodySize` (default `DEFAULT_MAX_BODY_SIZE`) is
answered `413` with a `PayloadTooLargeError` body, and the chunks are dropped
rather than concatenated — an oversized request never accumulates in memory. A
`content-length` header that already exceeds the limit short-circuits before any
data arrives.

### Handlers directly (own uWS app)

```typescript
import { pikkuHTTPHandler, pikkuWebsocketHandler } from '@pikku/uws-handler'

app.any('/*', pikkuHTTPHandler({ logger, logRoutes: true, loadSchemas: true }))
app.ws('/*', pikkuWebsocketHandler({ logger, logRoutes: true }))
```

Both take `{ logger, logRoutes?, loadSchemas? } & RunHTTPWiringOptions`.

## WebSocket Standalone (ws library)

For WebSocket-only servers using the `ws` library:

```bash
yarn add @pikku/ws
```

```typescript
import { pikkuWebsocketHandler } from '@pikku/ws'
import { stopSingletonServices } from '@pikku/core'
import { Server } from 'http'
import { WebSocketServer } from 'ws'
import './.pikku/pikku-bootstrap.gen.js'

const server = new Server()
const wss = new WebSocketServer({ noServer: true })

pikkuWebsocketHandler({
  server,
  wss,
  logger: singletonServices.logger,
})

server.listen(4002, 'localhost', () => {
  console.log('Server running at http://localhost:4002/')
})

process.on('SIGINT', async () => {
  await stopSingletonServices()
  wss.close()
  server.close()
  process.exit(0)
})
```

`pikkuWebsocketHandler` takes `{ server, wss, logger, logRoutes?, loadSchemas? }`
plus `RunHTTPWiringOptions`, and there is no server class in `@pikku/ws` — the
handler attaches to a `Server` you own.

`noServer: true` is required, not stylistic: the handler listens for the HTTP
server's own `upgrade` event, opens the channel (running middleware and auth
first), and only then calls `wss.handleUpgrade`. A `WebSocketServer` bound to
the server would take the socket before any of that ran. An upgrade the channel
rejects gets the socket destroyed, and an auth failure is written as a real HTTP
response on the raw socket rather than a silent drop.
