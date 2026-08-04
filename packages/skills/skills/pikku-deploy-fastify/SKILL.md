---
name: pikku-deploy-fastify
description: >-
  Use when deploying a Pikku app with Fastify. Covers PikkuFastifyServer standalone and
  pikkuFastifyPlugin for existing Fastify apps. TRIGGER when: code imports @pikku/fastify or
  @pikku/fastify-plugin, user mentions Fastify deployment, or start.ts creates a
  PikkuFastifyServer. DO NOT TRIGGER when: just defining functions/wirings without
  Fastify-specific code.
---

# Pikku Fastify Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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

**Methods:** `init(httpOptions?: RunHTTPWiringOptions)`, `start()`, `stop()`, `enableExitOnSigInt()`

**Property:** `app: FastifyInstance` — Direct access to Fastify instance.

`enableCors` exists on the class but **throws `Method not implemented.`** — unlike
the Express server. Register `@fastify/cors` on `app` yourself before `init()`.

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
