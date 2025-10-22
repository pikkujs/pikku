---
name: pikku-ws
description: Set up standalone WebSocket servers using the ws library. Use when building dedicated WebSocket servers for real-time communication, chat applications, or pub/sub systems.
tags: [pikku, websocket, ws, runtime, realtime]
---

# Pikku WebSocket (ws) Runtime

This skill helps you set up standalone WebSocket servers using the `ws` library.

## When to use this skill

- Building dedicated WebSocket servers
- Real-time communication (chat, notifications, live updates)
- Pub/sub systems
- Need standalone WebSocket server without HTTP framework
- Simple WebSocket-only deployments

## Installation

```bash
npm install @pikku/ws @pikku/core ws
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/ws/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/ws/src/start.ts)

**Key points:**
- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Create HTTP server and WebSocketServer
- Use `pikkuWebsocketHandler` to integrate Pikku
- Add health check endpoint manually

### Workspace Setup

Backend imports functions from workspace package.

**Example:** [workspace-starter/backends/ws/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/ws/bin/start.ts)

**Key differences:**
- Import config/services from functions package: `@my-app/functions/src/...`
- Import bootstrap from functions: `@my-app/functions/.pikku/pikku-bootstrap.gen`
- Use config for port/hostname

---

## Configuration

```typescript
type Config = {
  port: number
  hostname: string
}
```

**Note:** Unlike Express/Fastify, ws adapter doesn't have a built-in server class. You create the HTTP and WebSocket servers manually.

---

## Basic Pattern

```typescript
import { pikkuWebsocketHandler } from '@pikku/ws'
import { Server } from 'http'
import { WebSocketServer } from 'ws'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

// Create HTTP server
const server = new Server()

// Create WebSocket server (noServer mode)
const wss = new WebSocketServer({ noServer: true })

// Integrate Pikku
pikkuWebsocketHandler({
  server,
  wss,
  singletonServices,
  createSessionServices,
})

// Add health check
server.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/health-check') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
  }
})

server.listen(config.port, config.hostname)
```

---

## Development

### Scripts

**Standalone:**
```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "tsx watch src/start.ts",
    "start": "tsx src/start.ts"
  }
}
```

**Workspace:**
```json
{
  "scripts": {
    "dev": "tsx watch bin/start.ts",
    "start": "tsx bin/start.ts"
  }
}
```

---

## Deployment

WebSocket servers can be deployed anywhere Node.js runs. Use `hostname: '0.0.0.0'` for containerized deployments.

**Docker:** [workspace-starter/docker/Dockerfile.ws](https://github.com/vramework/examples/blob/main/workspace-starter/docker/Dockerfile.ws)

**Note:** Ensure your load balancer/proxy supports WebSocket upgrades (use sticky sessions if needed).

---

## Examples

**Standalone:**
- [templates/ws](https://github.com/vramework/pikku/tree/main/templates/ws) - Standalone WebSocket server

**Workspace:**
- [workspace-starter/backends/ws](https://github.com/vramework/examples/tree/main/workspace-starter/backends/ws) - Workspace backend

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from local: `'./.pikku/pikku-bootstrap.gen.js'`
- [ ] Import services from local files: `'./services.js'`
- [ ] Create HTTP server and WebSocketServer manually
- [ ] Pass both to `pikkuWebsocketHandler`
- [ ] Add health check endpoint manually

### Workspace Projects

- [ ] Import config/services from functions: `'@my-app/functions/src/...'`
- [ ] Import bootstrap from functions: `'@my-app/functions/.pikku/pikku-bootstrap.gen'`
- [ ] Backend package.json has `"@my-app/functions": "workspace:*"`

### Deployment

- [ ] Use `hostname: '0.0.0.0'` in Docker/containers
- [ ] Configure load balancer for WebSocket upgrades
- [ ] Use sticky sessions if load balancing
- [ ] Ensure health check responds on HTTP
