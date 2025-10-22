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

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/ws @pikku/core ws
```

### 2. Create Server File

**Standalone:** Create `src/start.ts` based on [templates/ws/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/ws/src/start.ts)

**Workspace:** Create `bin/start.ts` based on [workspace-starter/backends/ws/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/ws/bin/start.ts)

**Key imports:**
- Import bootstrap (see [pikku-project-setup](/skills/pikku-project-setup) for correct path)
- Import `pikkuWebsocketHandler` from `@pikku/ws`
- Import `Server` from `http` and `WebSocketServer` from `ws`
- Import config, services, and session factory

### 3. Create Servers Manually

```typescript
const server = new Server()                    // HTTP server for upgrades
const wss = new WebSocketServer({ noServer: true })  // WebSocket server
pikkuWebsocketHandler({ server, wss, singletonServices, createSessionServices })
```

**Note:** Unlike Express/Fastify, ws adapter has no built-in server class. You create HTTP and WebSocket servers manually.

### 4. Add Health Check

```typescript
server.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/health-check') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
  }
})
```

### 5. Update Package.json Scripts

See [pikku-project-setup](/skills/pikku-project-setup) for complete script patterns. WebSocket uses same scripts as Express/Fastify.

### 6. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start development server
npm run dev

# Verify health check
curl http://localhost:3000/health-check
```

**Expected outcome:** Server starts on configured port, health check returns `{"status":"ok"}`, Pikku WebSocket channels are registered.

---

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

---

## Related Skills

**Prerequisites:**
- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**
- [pikku-channel](/skills/pikku-channel) - WebSocket/channel wiring and configuration

**Alternative Runtimes:**
- [pikku-uws](/skills/pikku-uws) - Higher performance WebSocket with µWebSockets
- [pikku-express](/skills/pikku-express) - HTTP + WebSocket in one server
- [pikku-fastify](/skills/pikku-fastify) - HTTP + WebSocket in one server
