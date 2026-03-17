---
name: pikku-ws
description: 'Use when setting up a WebSocket server with the ws library in a Pikku app. Covers the ws runtime adapter for Pikku channels.
TRIGGER when: code uses @pikku/ws, user asks about ws library WebSocket server, or Node.js WebSocket runtime.
DO NOT TRIGGER when: user asks about WebSocket wiring/channels (use pikku-websocket) or uWebSockets (use pikku-deploy-uws).'
---

# Pikku WS (WebSocket Server Runtime)

`@pikku/ws` provides a WebSocket server runtime using the [ws](https://github.com/websockets/ws) library, connecting Pikku's channel system to a Node.js WebSocket server.

## Installation

```bash
yarn add @pikku/ws ws
```

## Usage Patterns

### Basic Setup

```typescript
import { PikkuWSServer } from '@pikku/ws'

const wsServer = new PikkuWSServer({
  server: httpServer,  // Node.js HTTP server
  singletonServices,
  createWireServices,
  channelStore,
})

await wsServer.init()
```

This runtime bridges the `ws` WebSocket library with Pikku's channel wiring. See `pikku-websocket` for channel wiring details and `pikku-deploy-fastify`/`pikku-deploy-express` for integrating with HTTP servers.
