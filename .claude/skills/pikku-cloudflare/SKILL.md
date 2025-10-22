---
name: pikku-cloudflare
description: Deploy Pikku functions to Cloudflare Workers for edge computing. Use for global distribution, ultra-low latency, pay-per-request pricing, and serverless applications at the edge.
tags: [pikku, cloudflare, workers, edge, runtime, deployment, serverless]
---

# Pikku Cloudflare Workers Runtime

This skill helps you deploy Pikku functions to Cloudflare Workers for edge computing.

## When to use this skill

- Edge computing (code runs close to users globally)
- Ultra-low latency (< 50ms worldwide)
- Pay-per-request pricing (10M requests free per day)
- Auto-scaling (0 to millions instantly)
- No cold starts (Workers start in < 1ms)
- Global distribution (deployed to 300+ cities)
- WebSocket support with Durable Objects
- Integration with Cloudflare services (KV, R2, D1, etc.)

**Performance:** Cloudflare Workers run on V8 isolates (not containers), resulting in near-instant startup and low memory overhead.

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/cloudflare @pikku/core
npm install -D wrangler @cloudflare/workers-types typescript
```

### 2. Create Worker File

**Standalone:** Create `src/index.ts` based on [templates/cloudflare-workers/src/index.ts](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/src/index.ts)

**Workspace:** Create `src/index.ts` based on [workspace-starter/backends/cloudflare/src/index.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/cloudflare/src/index.ts)

**Key imports:**
- Import bootstrap (see [pikku-project-setup](/skills/pikku-project-setup) for correct path)
- Import `runFetch` and `runScheduled` from `@pikku/cloudflare`
- Import setup functions and services
- Export default object with `fetch` and `scheduled` handlers

### 3. Configure wrangler.toml

Create `wrangler.toml` with:
- Worker name and main entry point
- Compatibility flags (nodejs_compat)
- Environment variables and bindings
- Routes and triggers

**Template:** [templates/cloudflare-workers/wrangler.toml](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/wrangler.toml)

**Critical:** Enable `nodejs_compat` for Node.js built-ins.

### 4. Setup Services from Env

```typescript
const localVariables = new LocalVariablesService(env)
const config = await createConfig(localVariables)
const localSecrets = new LocalSecretService(localVariables)
const singletonServices = await createSingletonServices(config, { secrets: localSecrets })
```

**Note:** No cold start caching needed (Workers start in < 1ms).

### 5. Update Package.json Scripts

```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

### 6. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start local development with wrangler
npm run dev

# Verify endpoint
curl http://localhost:8787/your-endpoint
```

**Expected outcome:** Wrangler dev starts local worker, endpoints respond correctly, near-instant startup times.

---

## Installation

```bash
npm install @pikku/cloudflare @pikku/core
npm install -D wrangler @cloudflare/workers-types typescript
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/cloudflare-workers/src/index.ts](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/src/index.ts)

**Key points:**
- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Import services from local files
- Export default object with `fetch` and `scheduled` handlers
- Use `setupServices` to initialize services from env
- Configure `wrangler.toml` for deployment

### Workspace - No Backend Config (Simpler)

Backend imports functions from the functions package.

**Example:** [workspace-starter/backends/cloudflare/src/index.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/cloudflare/src/index.ts)

**Key differences:**
- Import config/services from functions package: `@my-app/functions/src/services`
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
    "types": ["http", "scheduler"],
    "tags": ["api", "edge"],
    "excludeTags": ["server-only", "websocket"]
  }
}
```

**Bootstrap import:**
```typescript
// Import from backend's .pikku directory (custom filters)
import '../.pikku/pikku-bootstrap.gen'
```

**Build process:**
1. `cd backends/cloudflare`
2. `yarn pikku` (reads local pikku.config.json, applies custom filters)
3. Generated files in `backends/cloudflare/.pikku/` include only filtered functions

**Tradeoffs:**
- ✅ Custom filtering: Different API subsets per backend
- ✅ Tree-shaking: Better bundle size per backend
- ✅ Runtime-specific: Exclude incompatible functions per backend
- ❌ Slower: Must run `pikku` per backend

---

## Handler Types

### HTTP Fetch Handler

Handle HTTP requests at the edge.

**Pattern:**
```typescript
import { runFetch } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { createSessionServices } from './services.js'
import { ExportedHandler, Response } from '@cloudflare/workers-types'

import './.pikku/pikku-bootstrap.gen.js'

export default {
  async fetch(request, env): Promise<Response> {
    const singletonServices = await setupServices(env)
    return await runFetch(
      request as unknown as Request,
      singletonServices,
      createSessionServices
    )
  },
} satisfies ExportedHandler<Record<string, string>>
```

**See:** [templates/cloudflare-workers/src/index.ts](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/src/index.ts)

### Scheduled Tasks

Handle cron triggers.

**Pattern:**
```typescript
import { runScheduled } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { ExportedHandler } from '@cloudflare/workers-types'

export default {
  async scheduled(controller, env) {
    const singletonServices = await setupServices(env)
    await runScheduled(controller, singletonServices)
  },
} satisfies ExportedHandler<Record<string, string>>
```

**Configure cron in wrangler.toml:**
```toml
[triggers]
crons = ["0 0 * * *"]  # Daily at midnight UTC
```

---

## Service Setup

Services are initialized from Cloudflare environment variables.

**Pattern:**
```typescript
import { LocalVariablesService, LocalSecretService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from './services.js'

export const setupServices = async (
  env: Record<string, string | undefined>
) => {
  const localVariables = new LocalVariablesService(env)
  const config = await createConfig(localVariables)
  const localSecrets = new LocalSecretService(localVariables)
  return await createSingletonServices(config, {
    variables: localVariables,
    secrets: localSecrets,
  })
}
```

**Key points:**
- `LocalVariablesService`: Reads from Cloudflare env vars
- `LocalSecretService`: Reads secrets from env vars (set via wrangler)
- No cold start caching needed (Workers are fast)

**See:** [templates/cloudflare-workers/src/setup-services.ts](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/src/setup-services.ts)

---

## WebSocket Support

Cloudflare Workers support WebSockets via Durable Objects with hibernation.

**Example:** [templates/cloudflare-websocket/src/websocket-hibernation-server.ts](https://github.com/vramework/pikku/blob/main/templates/cloudflare-websocket/src/websocket-hibernation-server.ts)

**Pattern:**
```typescript
import { CloudflareWebSocketHibernationServer } from '@pikku/cloudflare'
import { CloudflareEventHubService } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { createSessionServices } from './services.js'

export class WebSocketHibernationServer extends CloudflareWebSocketHibernationServer {
  private singletonServices: SingletonServices | undefined

  protected async getParams() {
    if (!this.singletonServices) {
      this.singletonServices = await setupServices(this.env)
      this.singletonServices.eventHub = new CloudflareEventHubService(
        this.singletonServices.logger,
        this.ctx
      )
    }
    return {
      singletonServices: this.singletonServices,
      createSessionServices,
    }
  }
}
```

**Key points:**
- Extends `CloudflareWebSocketHibernationServer`
- Uses `CloudflareEventHubService` for WebSocket management
- Hibernation reduces memory usage when connections are idle
- Requires Durable Objects (paid plan)

**WebSocket examples:**
- [templates/cloudflare-websocket](https://github.com/vramework/pikku/tree/main/templates/cloudflare-websocket)
- [workspace-starter/backends/cloudflare-websocket](https://github.com/vramework/examples/tree/main/workspace-starter/backends/cloudflare-websocket)

---

## Wrangler Configuration

**wrangler.toml:**
```toml
#:schema node_modules/wrangler/config-schema.json
name = "my-pikku-app"
main = "src/index.ts"
compatibility_date = "2024-12-18"
compatibility_flags = ["nodejs_compat_v2"]

[observability]
enabled = true

[vars]
NODE_ENV = "production"

[triggers]
crons = ["0 0 * * *"]
```

**Key settings:**
- `main`: Entry point file (Wrangler compiles TypeScript automatically)
- `compatibility_date`: Cloudflare Workers API version
- `compatibility_flags`: Enable Node.js compatibility
- `[vars]`: Environment variables
- `[triggers]`: Cron schedules

**Secrets:** Set via wrangler CLI (not in wrangler.toml):
```bash
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

**See:** [templates/cloudflare-workers/wrangler.toml](https://github.com/vramework/pikku/blob/main/templates/cloudflare-workers/wrangler.toml)

---

## Development

### Scripts

**Standalone:**
```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "wrangler dev",
    "start": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

**Workspace (no backend config):**
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "start": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

**Workspace (with backend config):**
```json
{
  "scripts": {
    "pikku": "pikku",
    "prebuild": "npm run pikku",
    "dev": "wrangler dev",
    "start": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

### Local Development

Use `wrangler dev` to test Workers locally:

```bash
npm run dev
# Server runs at http://localhost:8787
```

**Features:**
- Hot reload on file changes
- Local environment variables
- Simulates edge runtime locally
- Access to local KV, R2, D1 (if configured)

---

## Deployment

Deploy to Cloudflare Workers:

```bash
# Deploy to production
wrangler deploy

# Deploy to specific environment
wrangler deploy --env staging

# View logs
wrangler tail

# Set secrets
wrangler secret put DATABASE_URL

# List deployments
wrangler deployments list
```

**Authentication:**
Login to Cloudflare:
```bash
wrangler login
```

**Custom domains:**
Configure in Cloudflare Dashboard → Workers & Pages → your worker → Settings → Triggers → Custom Domains

---

## Performance Tips

- **No bundler needed**: Wrangler compiles TypeScript automatically
- **Tree-shaking**: Unused code is removed automatically
- **CPU limits**: Workers have 50ms CPU time limit (10ms on free plan)
- **Memory limits**: 128MB memory limit
- **Subrequests**: Max 50 subrequests per Worker invocation
- **Durable Objects**: Use for stateful WebSocket connections
- **KV storage**: Use for read-heavy data (eventually consistent)
- **R2 storage**: Use for large files (S3-compatible)
- **D1 database**: Use for relational data (SQLite at edge)

---

## Examples

**Standalone:**
- [templates/cloudflare-workers](https://github.com/vramework/pikku/tree/main/templates/cloudflare-workers) - HTTP + cron
- [templates/cloudflare-websocket](https://github.com/vramework/pikku/tree/main/templates/cloudflare-websocket) - WebSocket with Durable Objects

**Workspace:**
- [workspace-starter/backends/cloudflare](https://github.com/vramework/examples/tree/main/workspace-starter/backends/cloudflare) - Workspace HTTP backend
- [workspace-starter/backends/cloudflare-websocket](https://github.com/vramework/examples/tree/main/workspace-starter/backends/cloudflare-websocket) - Workspace WebSocket backend

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from local: `'./.pikku/pikku-bootstrap.gen.js'`
- [ ] Import services from local files: `'./services.js'`
- [ ] Export default object with `fetch` and/or `scheduled` handlers
- [ ] Use `LocalVariablesService` and `LocalSecretService`
- [ ] Configure `wrangler.toml` with compatibility flags

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

### Configuration

- [ ] Set `compatibility_flags = ["nodejs_compat_v2"]` in wrangler.toml
- [ ] Use `wrangler secret put` for sensitive values (not wrangler.toml)
- [ ] Configure cron triggers in `[triggers]` section
- [ ] Enable observability for production monitoring

### WebSocket

- [ ] Extend `CloudflareWebSocketHibernationServer`
- [ ] Use `CloudflareEventHubService` for WebSocket management
- [ ] Requires Durable Objects (paid Cloudflare plan)
- [ ] Configure Durable Object bindings in wrangler.toml

### Deployment

- [ ] Run `wrangler login` to authenticate
- [ ] Use `wrangler deploy` to deploy
- [ ] Set secrets via `wrangler secret put`
- [ ] Monitor with `wrangler tail`
- [ ] Configure custom domains in Cloudflare Dashboard

### Performance

- [ ] Stay within 50ms CPU time limit
- [ ] Use KV for read-heavy data
- [ ] Use R2 for large file storage
- [ ] Use D1 for relational data at edge
- [ ] Limit subrequests to 50 per invocation

---

## Related Skills

**Prerequisites:**
- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**
- [pikku-http](/skills/pikku-http) - HTTP route wiring and configuration
- [pikku-scheduler](/skills/pikku-scheduler) - Scheduled task configuration
- [pikku-channel](/skills/pikku-channel) - WebSocket/channel wiring (with Durable Objects)

**Alternative Runtimes:**
- [pikku-aws-lambda](/skills/pikku-aws-lambda) - Serverless alternative
- [pikku-express](/skills/pikku-express) - Traditional server deployment
- [pikku-fastify](/skills/pikku-fastify) - Traditional server deployment
