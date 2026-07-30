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

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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

- `init(httpOptions?): Promise<void>` — Register middleware and routes
- `start(): Promise<void>` — Start listening
- `stop(): Promise<void>` — Graceful shutdown
- `enableExitOnSigInt(): Promise<void>` — SIGINT handler
- `enableCors(options): void` — Enable CORS
- `enableStaticAssets(): void` — Serve static files (requires `content` config)

**Property:** `app: Express` — Direct access to Express instance for custom middleware.

## Middleware (existing Express app)

```bash
yarn add @pikku/express-middleware
```

```typescript
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'
import './.pikku/pikku-bootstrap.gen.js'

const app = express()
app.use(
  pikkuExpressMiddleware({
    logger: singletonServices.logger,
    logRoutes: true,
    loadSchemas: true,
  })
)
```
