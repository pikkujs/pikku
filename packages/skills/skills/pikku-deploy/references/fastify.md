# Fastify

```bash
yarn add @pikku/fastify
```

## Standalone server

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

The config extends `CoreConfig` with `port`, `hostname` and an optional
`healthCheckPath`. `app: FastifyInstance` is exposed for direct access.

`enableCors` exists on the class but **throws `Method not implemented.`** —
unlike the Express server. Register `@fastify/cors` on `app` yourself before
`init()`.

Unlike the Express server, the health check is registered by `init()`, not the
constructor, so nothing answers before `init` runs. `init` also passes
`logRoutes: true` and `loadSchemas: true`, which your `httpOptions` can override.
The Fastify instance is constructed with no options; reach for the plugin package
if you need `Fastify({ … })` of your own.

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
    // plus any RunHTTPWiringOptions: maxBodySize, respondWith404, …
  },
})
```

Every option other than `logger` is optional, and the rest of the `pikku` object
is `RunHTTPWiringOptions` passed straight through.

The plugin registers a catch-all `fastify.all('/*')`, so mount it on a
[Fastify prefix](https://fastify.dev/docs/latest/Reference/Plugins/) if the app
has routes of its own to keep.

Fastify buffers the body itself, so its `bodyLimit` is where an oversized request
is stopped. `maxBodySize` sets it — and left unset, Fastify's stricter 1MB default
stands rather than being loosened to Pikku's 10MB fallback.
