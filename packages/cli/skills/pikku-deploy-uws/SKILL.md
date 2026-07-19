---
name: pikku-deploy-uws
description: >-
  Use when deploying a Pikku app with uWebSockets.js. Covers PikkuUWSServer with built-in HTTP and
  WebSocket support, and pikkuWebsocketHandler for standalone ws library. TRIGGER when: code
  imports @pikku/uws or @pikku/ws, user mentions uWebSockets or high-performance server, or
  start.ts creates a PikkuUWSServer. DO NOT TRIGGER when: just defining functions/wirings without
  uWS-specific code.
---

# Pikku uWebSockets.js Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Highest-throughput option among Pikku's runtimes. Handles both HTTP and WebSocket automatically.

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

**Constructor:** `new PikkuUWSServer(config, logger)`

**Config extends CoreConfig with:** `port`, `hostname`, `healthCheckPath?`

**Methods:** `init(httpOptions?)`, `start()`, `stop()`, `enableExitOnSigInt()`

**Property:** `app: uWS.App` — Direct access to uWebSockets app instance.

## WebSocket Standalone (ws library)

For WebSocket-only servers using the `ws` library:

```bash
yarn add @pikku/ws
```

```typescript
import { pikkuWebsocketHandler } from '@pikku/ws'
import { stopSingletonServices } from '@pikku/core'
import { Server } from 'http'
import { WebSocketServer } from 'ws'
import './.pikku/pikku-bootstrap.gen.js'

const server = new Server()
const wss = new WebSocketServer({ noServer: true })

pikkuWebsocketHandler({
  server,
  wss,
  logger: singletonServices.logger,
})

server.listen(4002, 'localhost', () => {
  console.log('Server running at http://localhost:4002/')
})

process.on('SIGINT', async () => {
  await stopSingletonServices()
  wss.close()
  server.close()
  process.exit(0)
})
```
