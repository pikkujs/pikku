# Express

```bash
yarn add @pikku/express
```

## Standalone server

```typescript
import { PikkuExpressServer } from '@pikku/express'
import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const appServer = new PikkuExpressServer(
  { ...config, port: 4002, hostname: 'localhost' },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

The config extends `CoreConfig` with `port`, `hostname`, an optional
`healthCheckPath`, an optional `limits` map and an optional `content`
(`LocalContentConfig`) for static assets and file uploads. `app: Express` is
exposed for custom middleware, and `getHttpServer()` returns the underlying
`http.Server` — to attach a WebSocket server, say — but throws before `start()`.

`enableStaticAssets()` serves `content.localFileUploadPath` under
`content.assetUrlPrefix`, and `enableReaper()` adds a `PUT /reaper/*path` upload
sink for local development, path-traversal checked and bounded by
`content.sizeLimit` (default `1mb`). Both throw when `content` is unset.

## Ordering, and what `init` installs for you

The health check is registered in the **constructor**, so it answers before any
middleware you add and cannot be wrapped in auth. It defaults to
`/health-check`; override with `healthCheckPath`.

Everything else is installed by `init()`: `express.json`, `express.text` (for
`text/xml`), `express.urlencoded`, `cookie-parser`, then the Pikku middleware.
Call `enableCors` **before** `init` if you want CORS applied to Pikku's routes.

Express buffers the body before Pikku sees it, so the parser limit is the only
place an oversized request can actually be stopped. `httpOptions.maxBodySize`
therefore feeds those parser limits, with an explicit `config.limits` entry
(`json` / `xml` / `urlencoded`) still winning. Everything defaults to `1mb`.

`init` passes `logRoutes: true` and `loadSchemas: true` by default; your
`httpOptions` spread over them, so you can turn either off.

`stop()` throws if the server was never started. `enableExitOnSigInt()`
installs a SIGINT handler that stops the singleton services, then the server,
then exits 0.

## Middleware (existing Express app)

```bash
yarn add @pikku/express-middleware
```

```typescript
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'
import './.pikku/pikku-bootstrap.gen.js'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use(
  pikkuExpressMiddleware({
    logger: singletonServices.logger,
    logRoutes: true,
    loadSchemas: true,
    // plus any RunHTTPWiringOptions: maxBodySize, respondWith404, coerceDataFromSchema
  })
)
```

Options beyond `logger` are all optional: `logRoutes` logs the wiring table once
at startup, `loadSchemas` compiles every schema up front, and the rest are
`RunHTTPWiringOptions` passed through per request.

On your own app **you** own the parser stack — the middleware reads `req.body`,
so a body parser and `cookie-parser` must be registered before it, and
`maxBodySize` alone will not stop an oversized request that your parser already
accepted. Unmatched requests fall through to `next()` (unless `respondWith404`
is set), so Pikku's routes coexist with your existing ones; a streaming response
is the exception and does not call `next()`.
