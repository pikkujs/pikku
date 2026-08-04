---
name: pikku-deploy-express
description: >-
  Use when deploying a Pikku app with Express. Covers PikkuExpressServer standalone and
  pikkuExpressMiddleware for existing Express apps. TRIGGER when: code imports @pikku/express or
  @pikku/express-middleware, user mentions Express deployment, or start.ts creates a
  PikkuExpressServer. DO NOT TRIGGER when: just defining functions/wirings without
  Express-specific code.
---

# Pikku Express Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

## Standalone Server

```bash
yarn add @pikku/express
```

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

**Constructor:** `new PikkuExpressServer(config, logger)`

**Config extends CoreConfig with:**

- `port: number`
- `hostname: string`
- `healthCheckPath?: string`
- `limits?: Partial<Record<string, string>>`
- `content?: LocalContentConfig` (for static assets / file uploads)

**Methods:**

- `init(httpOptions?: RunHTTPWiringOptions): Promise<void>` — installs the body parsers, the cookie parser and the Pikku middleware
- `start(): Promise<void>` — Start listening
- `stop(): Promise<void>` — Graceful shutdown; throws if the server was never started
- `enableExitOnSigInt(): Promise<void>` — SIGINT handler: stops the singleton services, then the server, then exits 0
- `enableCors(options): void` — Enable CORS
- `enableStaticAssets(): void` — serve `content.localFileUploadPath` under `content.assetUrlPrefix`
- `enableReaper(): void` — a `PUT /reaper/*path` upload sink for local development, path-traversal checked and bounded by `content.sizeLimit` (default `1mb`)
- `getHttpServer(): Server` — the underlying `http.Server`, e.g. to attach a WebSocket server; throws before `start()`

`enableStaticAssets` and `enableReaper` both throw when `content` is unset.

**Property:** `app: Express` — Direct access to Express instance for custom middleware.

### Ordering, and what `init` installs for you

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

On your own app **you** own the parser stack — the middleware reads
`req.body`, so a body parser and `cookie-parser` must be registered before it,
and `maxBodySize` alone will not stop an oversized request that your parser
already accepted. Unmatched requests fall through to `next()` (unless
`respondWith404` is set), so Pikku's routes coexist with your existing ones;
a streaming response is the exception and does not call `next()`.
