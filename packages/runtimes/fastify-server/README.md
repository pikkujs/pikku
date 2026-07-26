# @pikku/fastify

Fastify server for Pikku, with health checks and service wiring already set up.

Wraps `@pikku/fastify-plugin`. If you already have a Fastify instance, register
that plugin directly instead.

## Install

```bash
npm install @pikku/fastify fastify
```

## Usage

```typescript
import { PikkuFastifyServer } from '@pikku/fastify'

import './.pikku/pikku-bootstrap.gen.js'

const server = new PikkuFastifyServer(config, logger)

await server.init()
await server.start()
```

The underlying Fastify instance is exposed as `server.app`.

## Docs

https://pikku.dev/docs
