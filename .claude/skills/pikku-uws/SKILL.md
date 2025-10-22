---
name: pikku-uws
description: Set up high-performance servers using µWebSockets.js (uWebSockets). Use when building performance-critical applications requiring extreme low latency and high throughput.
tags: [pikku, uws, uwebsockets, runtime, performance, websocket]
---

# Pikku µWebSockets (uws) Runtime

This skill helps you set up high-performance servers using µWebSockets.js (uWebSockets).

## When to use this skill

- Extreme performance requirements (10x faster than Node.js HTTP)
- Low latency applications
- High throughput WebSocket connections
- Trading platforms, gaming servers, real-time systems
- Memory-constrained environments
- Need maximum requests per second

**Performance:** µWebSockets is written in C++ and significantly faster than standard Node.js HTTP/WebSocket implementations.

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/uws @pikku/core uWebSockets.js
```

### 2. Create Server File

**Standalone:** Create `src/start.ts` based on [templates/uws/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/uws/src/start.ts)

**Workspace:** Create `bin/start.ts` based on [workspace-starter/backends/uws/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/uws/bin/start.ts)

**Key imports:**

- Import bootstrap (see [pikku-project-setup](/skills/pikku-project-setup) for correct path)
- Import `PikkuUWSServer` from `@pikku/uws`
- Import config, services, and session factory

### 3. Configure µWebSockets Settings

```typescript
type UWSCoreConfig = CoreConfig & {
  port: number // Default: 3000
  hostname: string // Default: 'localhost' (use '0.0.0.0' for Docker)
  healthCheckPath?: string // Default: '/health-check'
}
```

### 4. Update Package.json Scripts

See [pikku-project-setup](/skills/pikku-project-setup) for complete script patterns. µWebSockets uses same scripts as Express/Fastify.

### 5. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start development server
npm run dev

# Verify health check
curl http://localhost:3000/health-check
```

**Expected outcome:** Server starts on configured port, health check returns `{"status":"ok"}`, Pikku routes are registered. µWebSockets provides 10x better performance than standard Node.js HTTP.

---

## Installation

```bash
npm install @pikku/uws @pikku/core uWebSockets.js
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/uws/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/uws/src/start.ts)

**Key points:**

- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Import services from local files
- Create `PikkuUWSServer` with config, services, and session factory
- Call `enableExitOnSigInt()` for graceful shutdown
- Call `init()` then `start()`

### Workspace - No Backend Config (Simpler)

Backend imports functions from the functions package.

**Example:** [workspace-starter/backends/uws/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/uws/bin/start.ts)

**Key differences:**

- Import config/services from functions package: `@my-app/functions/src/config`
- Import bootstrap from functions: `@my-app/functions/.pikku/pikku-bootstrap.gen`
- No `pikku` script needed in backend package.json
- Uses functions package filters

**Tradeoffs:**

- ✅ Faster: No extra build step per backend
- ✅ Simpler: One source of truth
- ❌ Can't customize filtering (uses functions package filters)

### Workspace - With Backend Config (Filtered)

Backend has its own `pikku.config.json` with custom filters.

**Backend pikku.config.json:**

```json
{
  "extends": "../../packages/functions/pikku.config.json",
  "filters": {
    "types": ["http", "channel", "scheduler"],
    "tags": ["api", "uws", "performance"],
    "excludeTags": ["edge-only", "lambda-only"]
  }
}
```

**Bootstrap import:**

```typescript
// Import from backend's .pikku directory (custom filters)
import '../.pikku/pikku-bootstrap.gen'
```

**Build process:**

1. `cd backends/uws`
2. `yarn pikku` (reads local pikku.config.json, applies custom filters)
3. Generated files in `backends/uws/.pikku/` include only filtered functions

**Tradeoffs:**

- ✅ Custom filtering: Different API subsets per backend
- ✅ Tree-shaking: Better bundle size per backend
- ✅ Runtime-specific: Exclude incompatible functions per backend
- ❌ Slower: Must run `pikku` per backend

---

## Configuration

Server mode extends `CoreConfig` with uws-specific options:

```typescript
type UWSCoreConfig = CoreConfig & {
  port: number
  hostname: string // Use '0.0.0.0' for Docker
  healthCheckPath?: string // Default: '/health-check'
}
```

**See:** [templates/uws/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/uws/src/start.ts) for config usage

---

## Lifecycle

```typescript
const server = new PikkuUWSServer(
  config,
  singletonServices,
  createSessionServices
)
server.enableExitOnSigInt() // Graceful shutdown
await server.init() // Initialize (required)
await server.start() // Start listening
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

**Workspace (no backend config):**

```json
{
  "scripts": {
    "dev": "tsx watch bin/start.ts",
    "start": "tsx bin/start.ts"
  }
}
```

**Workspace (with backend config):**

```json
{
  "scripts": {
    "pikku": "pikku",
    "prebuild": "npm run pikku",
    "dev": "tsx watch bin/start.ts",
    "start": "tsx bin/start.ts"
  }
}
```

### Health Check

Default endpoint: `GET /health-check` → `{"status":"ok"}`

Customize via config: `{ healthCheckPath: '/health' }`

---

## Deployment

µWebSockets servers can be deployed anywhere Node.js runs. Use `hostname: '0.0.0.0'` for containerized deployments.

**Docker:** [workspace-starter/docker/Dockerfile.uws](https://github.com/vramework/examples/blob/main/workspace-starter/docker/Dockerfile.uws)

**Performance Tips:**

- Use cluster mode or multiple instances for multi-core systems
- Monitor memory usage (uws is more memory-efficient)
- Profile with load testing tools (wrk, autocannon)
- Consider backpressure handling for WebSocket connections

---

## Examples

**Standalone:**

- [templates/uws](https://github.com/vramework/pikku/tree/main/templates/uws) - Standalone uws server

**Workspace:**

- [workspace-starter/backends/uws](https://github.com/vramework/examples/tree/main/workspace-starter/backends/uws) - Workspace backend

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from local: `'./.pikku/pikku-bootstrap.gen.js'`
- [ ] Import services from local files: `'./services.js'`
- [ ] Call `server.enableExitOnSigInt()` for graceful shutdown
- [ ] Call `server.init()` before `server.start()`

### Workspace (No Backend Config)

- [ ] Import config/services from functions: `'@my-app/functions/src/...'`
- [ ] Import bootstrap from functions: `'@my-app/functions/.pikku/pikku-bootstrap.gen'`
- [ ] Backend package.json has `"@my-app/functions": "workspace:*"`
- [ ] No `pikku` script needed

### Workspace (With Backend Config)

- [ ] Backend has `pikku.config.json` with `extends`
- [ ] Import bootstrap from backend: `'../.pikku/pikku-bootstrap.gen'`
- [ ] Backend package.json includes `"pikku": "pikku"` script
- [ ] Backend package.json includes `"@pikku/cli"` in devDependencies
- [ ] Run `pikku` in backend directory to generate filtered wiring

### Deployment

- [ ] Use `hostname: '0.0.0.0'` in Docker/containers
- [ ] Configure health check endpoint
- [ ] Enable graceful shutdown
- [ ] Use cluster mode for multi-core systems
- [ ] Monitor memory and CPU usage under load

---

## Related Skills

**Prerequisites:**

- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**

- [pikku-http](/skills/pikku-http) - HTTP route wiring and configuration
- [pikku-channel](/skills/pikku-channel) - WebSocket/channel wiring

**Alternative Runtimes:**

- [pikku-express](/skills/pikku-express) - More common, larger ecosystem
- [pikku-fastify](/skills/pikku-fastify) - High performance alternative
- [pikku-ws](/skills/pikku-ws) - Simple WebSocket server
- [pikku-aws-lambda](/skills/pikku-aws-lambda) - Serverless deployment
