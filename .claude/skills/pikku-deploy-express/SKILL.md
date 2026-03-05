---
name: pikku-deploy-express
description: 'Use when deploying a Pikku app with Express. Covers PikkuExpressServer standalone and pikkuExpressMiddleware for existing Express apps.
TRIGGER when: code imports @pikku/express or @pikku/express-middleware, user mentions Express deployment, or start.ts creates a PikkuExpressServer.
DO NOT TRIGGER when: just defining functions/wirings without Express-specific code.'
---

# Pikku Express Deployment

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
app.use(pikkuExpressMiddleware({
  logger: singletonServices.logger,
  logRoutes: true,
  loadSchemas: true,
}))
```
