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

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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

```typescript
import { PikkuWSServer } from '@pikku/ws'

const wsServer = new PikkuWSServer({
  server: httpServer, // Node.js HTTP server
  singletonServices,
  createWireServices,
  channelStore,
})

await wsServer.init()
```

This runtime bridges the `ws` WebSocket library with Pikku's channel wiring. See `pikku-websocket` for channel wiring details and `pikku-deploy-fastify`/`pikku-deploy-express` for integrating with HTTP servers.
