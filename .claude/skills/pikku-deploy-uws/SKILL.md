---
name: pikku-deploy-uws
description: 'Use when deploying a Pikku app with uWebSockets.js. Covers PikkuUWSServer with built-in HTTP and WebSocket support, and pikkuWebsocketHandler for standalone ws library.
TRIGGER when: code imports @pikku/uws or @pikku/ws, user mentions uWebSockets or high-performance server, or start.ts creates a PikkuUWSServer.
DO NOT TRIGGER when: just defining functions/wirings without uWS-specific code.'
---

# Pikku uWebSockets.js Deployment

Highest performance option. Handles both HTTP and WebSocket automatically.

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
