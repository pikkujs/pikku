# uWebSockets.js

Highest-throughput option among Pikku's runtimes. Handles both HTTP and
WebSocket automatically.

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

The config extends `CoreConfig` with `port`, `hostname` and an optional
`healthCheckPath`. `app: uWS.App` is exposed for direct access.

## What the server does and does not give you

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

## Body limits

uWS hands over raw chunks with no limit of its own, so the handler counts the
bytes itself. A request over `maxBodySize` (default `DEFAULT_MAX_BODY_SIZE`) is
answered `413` with a `PayloadTooLargeError` body, and the chunks are dropped
rather than concatenated — an oversized request never accumulates in memory. A
`content-length` header that already exceeds the limit short-circuits before any
data arrives.

## Handlers directly (own uWS app)

```typescript
import { pikkuHTTPHandler, pikkuWebsocketHandler } from '@pikku/uws-handler'

app.any('/*', pikkuHTTPHandler({ logger, logRoutes: true, loadSchemas: true }))
app.ws('/*', pikkuWebsocketHandler({ logger, logRoutes: true }))
```

Both take `{ logger, logRoutes?, loadSchemas? } & RunHTTPWiringOptions`.

For a WebSocket-only server on the `ws` library instead, see `ws.md`.
