---
name: pikku-ws
description: >-
  Use when setting up a WebSocket server with the ws library in a Pikku app. Covers the ws runtime
  adapter for Pikku channels. TRIGGER when: code uses @pikku/ws, user asks about ws library
  WebSocket server, or Node.js WebSocket runtime. DO NOT TRIGGER when: user asks about WebSocket
  wiring/channels (use pikku-websocket) or uWebSockets (use pikku-deploy-uws).
---

# Pikku WS (WebSocket Server Runtime)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/ws` provides a WebSocket server runtime using the [ws](https://github.com/websockets/ws) library, connecting Pikku's channel system to a Node.js WebSocket server.

## Installation

```bash
yarn add @pikku/ws ws
```

## Usage Patterns

### Basic Setup

The package exports one function, `pikkuWebsocketHandler` — there is no server
class. You own the `http.Server` and the `WebSocketServer`; the handler attaches
the upgrade and message plumbing to them.

```typescript
import { DEFAULT_WS_MAX_PAYLOAD, pikkuWebsocketHandler } from '@pikku/ws'
import { stopSingletonServices } from '@pikku/core'
import { Server } from 'http'
import { WebSocketServer } from 'ws'

import '../.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const server = new Server()
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: DEFAULT_WS_MAX_PAYLOAD,
})

pikkuWebsocketHandler({
  server,
  wss,
  logger: singletonServices.logger,
  logRoutes: true, // print the wired channels at startup
  loadSchemas: true, // compile input schemas up front
})

server.listen(4002, 'localhost')
```

`noServer: true` is not optional decoration — the handler performs the upgrade
itself so it can run pikku's HTTP middleware chain (auth, cors) against the
upgrade request before a channel exists. Letting `ws` bind the server directly
would skip that.

Services come from the bootstrap import and the global singleton registry, which
is why nothing is passed in. The event hub is taken from
`singletonServices.eventHub` when it is a `LocalEventHubService`, and a local one
is created otherwise — so a single-process app gets pub/sub for free, while a
multi-instance deployment must register a distributed hub (see `pikku-realtime`).

The options type also extends `RunHTTPWiringOptions`, so per-request settings
such as `respondWith404`, `coerceDataFromSchema` and `bubbleErrors` are accepted
here too.

On shutdown, call `stopSingletonServices()` then close `wss` and `server`.

See `pikku-websocket` for channel wiring details, and
`pikku-deploy-fastify`/`pikku-deploy-express` when the WebSocket server shares a
port with an HTTP app.
