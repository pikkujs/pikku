---
name: pikku-express
description: Set up and deploy Pikku functions with Express.js server. Use when building traditional Node.js web servers, REST APIs, or integrating Pikku into existing Express applications.
tags: [pikku, express, runtime, server, deployment]
---

# Pikku Express Runtime

This skill helps you set up and deploy Pikku functions using Express.js as the runtime adapter.

## When to use this skill

- Building traditional Node.js web servers
- Creating REST APIs with Express
- Integrating Pikku into existing Express applications
- Development and production Express deployments
- Need for middleware ecosystem and Express plugins

## Runtime Modes

Pikku provides two Express integration modes:

### Server Mode (`@pikku/express`)

Full Express server managed by Pikku with automatic setup.

**Use when:**

- Starting a new Express server
- Want automatic configuration (JSON parsing, cookies, CORS)
- Need built-in features (health checks, static assets, file uploads)

### Middleware Mode (`@pikku/express-middleware`)

Integrate Pikku into an existing Express app as middleware.

**Use when:**

- Integrating into existing Express application
- Need custom Express configuration
- Want full control over middleware stack

---

## Installation

**Server mode:**

```bash
npm install @pikku/express @pikku/core @pikku/schedule
```

**Middleware mode:**

```bash
npm install @pikku/express-middleware @pikku/core
```

---

## Server Mode

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/express/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/express/src/start.ts)

**Key points:**

- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Import services from local files
- Create `PikkuExpressServer` with config, services, and session factory
- Call `enableExitOnSigInt()` for graceful shutdown
- Call `init()` then `start()`

### Workspace - No Backend Config (Simpler)

Backend imports all functions from the functions package without filtering.

**Example:** [workspace-starter/backends/express/bin/start.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/express/bin/start.ts)

**Key differences:**

- Import config/services from functions package: `@my-app/functions/src/config`
- Import bootstrap from functions: `@my-app/functions/.pikku/pikku-bootstrap.gen`
- No `pikku` script needed in backend package.json
- All functions included (no filtering)

**Tradeoffs:**

- ✅ Faster: No extra build step per backend
- ✅ Simpler: One source of truth
- ❌ No filtering: All functions included

### Workspace - With Backend Config (Filtered)

Backend has its own `pikku.config.json` that filters which functions are included.

**Directory structure:**

```
backends/
  express/
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
    "tags": ["api", "express"],
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

1. `cd backends/express`
2. `yarn pikku` (reads local pikku.config.json, applies filters)
3. Generated files in `backends/express/.pikku/` include only filtered functions

**Tradeoffs:**

- ✅ Filtering: Different API subsets per backend
- ✅ Tree-shaking: Better bundle size
- ✅ Runtime-specific: Exclude incompatible functions
- ❌ Slower: Must run `pikku` per backend

### Configuration

Server mode extends `CoreConfig` with Express-specific options:

```typescript
type ExpressCoreConfig = CoreConfig & {
  port: number
  hostname: string // Use '0.0.0.0' for Docker
  healthCheckPath?: string // Default: '/health-check'
  limits?: {
    json?: string // Default: '1mb'
    xml?: string
    urlencoded?: string
  }
}
```

**See:** [templates/express/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/express/src/start.ts) for config usage

### Lifecycle

```typescript
const server = new PikkuExpressServer(
  config,
  singletonServices,
  createSessionServices
)
server.enableExitOnSigInt() // Graceful shutdown
await server.init() // Initialize (required)
await server.start() // Start listening
```

### With Scheduler

Run Express + scheduled tasks in the same process:

```typescript
import { PikkuTaskScheduler } from '@pikku/schedule'

// After server.start()
const scheduler = new PikkuTaskScheduler(singletonServices)
scheduler.startAll()
```

**See:** [templates/express/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/express/src/start.ts)

### Optional Features

**CORS:**

```typescript
server.enableCors({ origin: '*', credentials: true })
```

**Static Assets:**

```typescript
server.enableStaticAssets() // Requires content config
```

**File Uploads:**

```typescript
server.enableReaper() // Enables PUT /reaper/:path
```

**Note:** Enable optional features **before** calling `server.init()`

---

## Middleware Mode

Integrate Pikku into an existing Express application.

**Example:** [templates/express-middleware/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/express-middleware/src/start.ts)

**Setup:**

```typescript
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

const app = express()
app.use(express.json())

app.use(
  pikkuExpressMiddleware(singletonServices, createSessionServices, {
    logRoutes: true,
    loadSchemas: true,
    respondWith404: false, // Pass to next middleware if route not found
  })
)

// Your custom routes can go after
app.get('/custom', (req, res) => { ... })

app.listen(3000)
```

### Middleware Options

- `logRoutes`: Log registered routes on startup
- `loadSchemas`: Compile and validate schemas
- `respondWith404`: If `false`, passes unmatched routes to next Express middleware (recommended)

**CRITICAL:** Set `respondWith404: false` to allow your custom Express routes to work.

---

## Development

### Scripts

**Standalone:**

```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "tsx watch src/start.ts | pino-pretty -i time,hostname,pid",
    "start": "tsx src/start.ts"
  }
}
```

**Workspace (no backend config):**

```json
{
  "scripts": {
    "dev": "tsx watch bin/start.ts | pino-pretty -i time,hostname,pid",
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
    "dev": "tsx watch bin/start.ts | pino-pretty -i time,hostname,pid",
    "start": "tsx bin/start.ts"
  }
}
```

### Health Check

Default endpoint: `GET /health-check` → `{"status":"ok"}`

Customize via config: `{ healthCheckPath: '/health' }`

---

## Deployment

Express servers can be deployed anywhere Node.js runs. Use `hostname: '0.0.0.0'` for containerized deployments.

For Docker-specific guidance, see [Docker's Node.js guide](https://docs.docker.com/language/nodejs/).

---

## Examples

**Standalone:**

- [templates/express](https://github.com/vramework/pikku/tree/main/templates/express) - Server mode
- [templates/express-middleware](https://github.com/vramework/pikku/tree/main/templates/express-middleware) - Middleware mode

**Workspace:**

- [workspace-starter/backends/express](https://github.com/vramework/examples/tree/main/workspace-starter/backends/express) - Workspace backend

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

### Middleware Mode

- [ ] Apply Pikku middleware **after** body parsers
- [ ] Set `respondWith404: false` to allow custom routes
- [ ] Bootstrap import still required

### Deployment

- [ ] Use `hostname: '0.0.0.0'` in Docker/containers
- [ ] Configure health check endpoint
- [ ] Enable graceful shutdown
