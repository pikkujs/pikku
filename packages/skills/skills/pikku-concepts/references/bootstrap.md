# Server bootstrap

There are two ways to start a Pikku app. Pick based on whether you need to own the HTTP server.

**1. Let Pikku own the server (preferred when you don't need a specific runtime)**

`pikku dev` and `pikku serve` create the config and singleton services, start the server, and shut it down cleanly. You write no bootstrap code at all — startup and shutdown work goes in lifecycle hooks:

```typescript
// src/lifecycle.ts
import { pikkuServerLifecycle } from '@pikku/core'
import type { SingletonServices } from '../types/application-types.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ kysely }) => {
    await runMigrations(kysely)
  },
  afterStart: async ({ logger }) => {
    logger.info('accepting traffic')
  },
  beforeStop: async ({ queueService }) => {
    await queueService.drain()
  },
})
```

Export exactly one `pikkuServerLifecycle` from anywhere in `srcDirectories` — the inspector finds it by the wrapper call. Every hook is optional and receives the already-created singleton services. See pikku-services for the ordering and the `afterStop` caveat.

**Only `pikku dev` and `pikku serve` invoke these hooks.** No deploy runtime does, so anything a Workers or serverless stage needs done cannot live here — put it on the request path that needs it, guarded by a cheap check.

**2. Bootstrap it yourself (required for a specific runtime)**

Express, Fastify, uWS, Lambda, Cloudflare and Next.js need their own entrypoint, because Pikku is embedded in a server you own:

```typescript
import '../../functions/.pikku/pikku-bootstrap.gen.js' // Generated — registers all wirings

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

// Pick your runtime:
const server = new PikkuFastifyServer(
  config,
  singletonServices,
  createWireServices
)
// or: new PikkuExpressServer(config, singletonServices, createWireServices)
// or: pikkuAWSLambdaHandler(singletonServices)
// or: PikkuCloudflareHandler(singletonServices)
// or: pikkuNextHandler(singletonServices)

await server.init()
await server.start()
```

**Lifecycle hooks do not run on this path** — only `pikku dev` and `pikku serve` invoke them. Do your startup work directly in the entrypoint instead.

`pikku validate` warns when a project starts a server by hand _and_ depends on no runtime adapter, since that combination means path 1 was available and unused. Silence it with `"lint": { "customServerBootstrap": "off" }` in `pikku.config.json`.
