---
name: pikku-deploy-fastify
description: 'Use when deploying a Pikku app with Fastify. Covers PikkuFastifyServer standalone and pikkuFastifyPlugin for existing Fastify apps.
TRIGGER when: code imports @pikku/fastify or @pikku/fastify-plugin, user mentions Fastify deployment, or start.ts creates a PikkuFastifyServer.
DO NOT TRIGGER when: just defining functions/wirings without Fastify-specific code.'
---

# Pikku Fastify Deployment

## Standalone Server

```bash
yarn add @pikku/fastify
```

```typescript
import { PikkuFastifyServer } from '@pikku/fastify'
import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const appServer = new PikkuFastifyServer(
  { ...config, hostname: 'localhost', port: 4002 },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

**Constructor:** `new PikkuFastifyServer(config, logger)`

**Config extends CoreConfig with:** `port`, `hostname`, `healthCheckPath?`

**Methods:** `init(httpOptions?)`, `start()`, `stop()`, `enableExitOnSigInt()`

**Property:** `app: FastifyInstance` — Direct access to Fastify instance.

## Plugin (existing Fastify app)

```bash
yarn add @pikku/fastify-plugin
```

```typescript
import Fastify from 'fastify'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'
import './.pikku/pikku-bootstrap.gen.js'

const app = Fastify()
app.register(pikkuFastifyPlugin, {
  pikku: {
    logger: singletonServices.logger,
    logRoutes: true,
    loadSchemas: true,
  },
})
```
