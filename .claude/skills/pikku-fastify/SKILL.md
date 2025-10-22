---
name: pikku-fastify
description: Set up and deploy Pikku functions with Fastify server. Use when building high-performance Node.js APIs, microservices, or integrating Pikku into existing Fastify applications.
tags: [pikku, fastify, runtime, server, deployment, performance]
---

# Pikku Fastify Runtime

This skill helps you set up and deploy Pikku functions using Fastify as the runtime adapter.

## When to use this skill

- Building high-performance APIs
- Creating microservices
- Need for low overhead and fast request handling
- Integrating Pikku into existing Fastify applications
- Want Fastify's plugin ecosystem
- Performance-critical applications

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

**Server mode:**

```bash
npm install @pikku/fastify @pikku/core @pikku/schedule
```

**Plugin mode:**

```bash
npm install @pikku/fastify-plugin @pikku/core
```

### 2. Create Server File

**Standalone (Server mode):** Create `src/start.ts` based on [templates/fastify/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify/src/start.ts)

**Standalone (Plugin mode):** Create `src/start.ts` based on [templates/fastify-plugin/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify-plugin/src/start.ts)

**Workspace:** Create `bin/start.ts` based on [workspace-starter/backends/fastify/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/fastify/bin/start.ts)

**Key imports:**

- Import bootstrap (see [pikku-project-setup](/skills/pikku-project-setup) for correct path)
- **Server mode:** Import `PikkuFastifyServer` from `@pikku/fastify`
- **Plugin mode:** Import `pikkuFastifyPlugin` from `@pikku/fastify-plugin`
- Import config, services, and session factory

### 3. Configure Fastify-Specific Settings

```typescript
type FastifyCoreConfig = CoreConfig & {
  port: number // Default: 3000
  hostname: string // Default: 'localhost' (use '0.0.0.0' for Docker)
  healthCheckPath?: string // Default: '/health-check'
}
```

**Server mode tip:** Access `server.app` to register Fastify plugins before calling `init()`.

### 4. Update Package.json Scripts

See [pikku-project-setup](/skills/pikku-project-setup) for complete script patterns. Fastify uses same scripts as Express.

### 5. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start development server
npm run dev

# Verify health check
curl http://localhost:3000/health-check
```

**Expected outcome:** Server starts on configured port, health check returns `{"status":"ok"}`, Pikku routes are registered. Fastify logs show startup time.

---

## Runtime Modes

Pikku provides two Fastify integration modes:

### Server Mode (`@pikku/fastify`)

Full Fastify server managed by Pikku with automatic setup.

**Use when:**

- Starting a new Fastify server
- Want automatic configuration
- Need built-in health checks

### Plugin Mode (`@pikku/fastify-plugin`)

Integrate Pikku into an existing Fastify app as a plugin.

**Use when:**

- Integrating into existing Fastify application
- Need custom Fastify configuration
- Want full control over plugin registration order

---

## Installation

**Server mode:**

```bash
npm install @pikku/fastify @pikku/core @pikku/schedule
```

**Plugin mode:**

```bash
npm install @pikku/fastify-plugin @pikku/core
```

---

## Server Mode

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/fastify/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify/src/start.ts)

**Key points:**

- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Import services from local files
- Create `PikkuFastifyServer` with config, services, and session factory
- Call `enableExitOnSigInt()` for graceful shutdown
- Call `init()` then `start()`

### Workspace - No Backend Config (Simpler)

Backend imports all functions from the functions package without filtering.

**Example:** [workspace-starter/backends/fastify/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/fastify/bin/start.ts)

**Key differences:**

- Import config/services from functions package: `@my-app/functions/src/config`
- Import bootstrap from functions: `@my-app/functions/.pikku/pikku-bootstrap.gen`
- No `pikku` script needed in backend package.json
- All functions included (no filtering)

**Tradeoffs:**

- ✅ Faster: No extra build step per backend
- ✅ Simpler: One source of truth
- ❌ Can't customize filtering (uses functions package filters)

### Workspace - With Backend Config (Filtered)

Backend has its own `pikku.config.json` that filters which functions are included.

**Directory structure:**

```
backends/
  fastify/
    bin/start.ts
    package.json              # Includes "pikku": "pikku" + @pikku/cli devDep
    pikku.config.json         # Extends functions config, applies filters
    .pikku/
      pikku-bootstrap.gen.js  # Generated (filtered)
packages/
  functions/
    pikku.config.json
    .pikku/
      pikku-bootstrap.gen.js  # Generated (all functions)
```

**Backend pikku.config.json:**

```json
{
  "extends": "../../packages/functions/pikku.config.json",
  "filters": {
    "types": ["http", "channel", "scheduler"],
    "tags": ["api", "fastify"],
    "excludeTags": ["edge-only", "lambda-only"]
  }
}
```

**Bootstrap import:**

```typescript
// Import from backend's .pikku directory (filtered)
import '../.pikku/pikku-bootstrap.gen'
```

**Build process:**

1. `cd backends/fastify`
2. `yarn pikku` (reads local pikku.config.json, applies filters)
3. Generated files in `backends/fastify/.pikku/` include only filtered functions

**Tradeoffs:**

- ✅ Filtering: Different API subsets per backend
- ✅ Tree-shaking: Better bundle size
- ✅ Runtime-specific: Exclude incompatible functions
- ❌ Slower: Must run `pikku` per backend

### Configuration

Server mode extends `CoreConfig` with Fastify-specific options:

```typescript
type FastifyCoreConfig = CoreConfig & {
  port: number
  hostname: string // Use '0.0.0.0' for Docker
  healthCheckPath?: string // Default: '/health-check'
}
```

**See:** [templates/fastify/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify/src/start.ts) for config usage

### Lifecycle

```typescript
const server = new PikkuFastifyServer(
  config,
  singletonServices,
  createSessionServices
)
server.enableExitOnSigInt() // Graceful shutdown
await server.init() // Initialize (required)
await server.start() // Start listening
```

### With Scheduler

Run Fastify + scheduled tasks in the same process:

```typescript
import { PikkuTaskScheduler } from '@pikku/schedule'

// After server.start()
const scheduler = new PikkuTaskScheduler(singletonServices)
scheduler.startAll()
```

**See:** [templates/fastify/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify/src/start.ts)

### Accessing Fastify Instance

Access the Fastify app to register custom plugins or routes:

```typescript
const server = new PikkuFastifyServer(
  config,
  singletonServices,
  createSessionServices
)

// Register Fastify plugins before init()
server.app.register(somePlugin)

await server.init()
await server.start()
```

---

## Plugin Mode

Integrate Pikku into an existing Fastify application.

**Example:** [templates/fastify-plugin/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/fastify-plugin/src/start.ts)

**Setup:**

```typescript
import Fastify from 'fastify'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

const app = Fastify({})

// Your custom routes
app.get('/health-check', async () => ({ status: 'ok' }))

// Register Pikku plugin
app.register(pikkuFastifyPlugin, {
  pikku: {
    singletonServices,
    createSessionServices,
    logRoutes: true, // Log registered routes
    loadSchemas: true, // Enable schema validation
  },
})

await app.listen({ port: 4002, host: 'localhost' })
```

### Plugin Options

- `singletonServices`: Required singleton services
- `createSessionServices`: Required session factory
- `logRoutes`: Log registered routes on startup
- `loadSchemas`: Compile and validate schemas

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

Fastify servers can be deployed anywhere Node.js runs. Use `hostname: '0.0.0.0'` for containerized deployments.

**Docker:** [workspace-starter/docker/Dockerfile.fastify](https://github.com/vramework/examples/blob/main/workspace-starter/docker/Dockerfile.fastify)

**Performance note:** Fastify is designed for low overhead. In production, consider running multiple instances behind a load balancer or using cluster mode with PM2.

---

## Examples

**Standalone:**

- [templates/fastify](https://github.com/vramework/pikku/tree/main/templates/fastify) - Server mode
- [templates/fastify-plugin](https://github.com/vramework/pikku/tree/main/templates/fastify-plugin) - Plugin mode

**Workspace:**

- [workspace-starter/backends/fastify](https://github.com/vramework/examples/tree/main/workspace-starter/backends/fastify) - Workspace backend

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

### Plugin Mode

- [ ] Register Pikku plugin with `app.register()`
- [ ] Pass `singletonServices` and `createSessionServices` in options
- [ ] Bootstrap import still required

### Deployment

- [ ] Use `hostname: '0.0.0.0'` in Docker/containers
- [ ] Configure health check endpoint
- [ ] Enable graceful shutdown
- [ ] Consider cluster mode for production

---

## Related Skills

**Prerequisites:**

- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**

- [pikku-http](/skills/pikku-http) - HTTP route wiring and configuration
- [pikku-channel](/skills/pikku-channel) - WebSocket/channel wiring
- [pikku-scheduler](/skills/pikku-scheduler) - Scheduled task configuration

**Alternative Runtimes:**

- [pikku-express](/skills/pikku-express) - More common, larger ecosystem
- [pikku-uws](/skills/pikku-uws) - Even higher performance with µWebSockets
- [pikku-aws-lambda](/skills/pikku-aws-lambda) - Serverless deployment
