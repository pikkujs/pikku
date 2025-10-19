---
name: pikku-yarn-workspace
description: Organize Pikku monorepos with Yarn workspaces - directory structure and package organization
tags: [pikku, monorepo, yarn, workspace]
---

# Pikku Yarn Workspace

This skill covers Yarn workspace structure and organization for Pikku monorepos. For function writing, wiring, services, and other details, see the related skills listed at the bottom.

## Directory Structure

Yarn workspace monorepos use top-level separation for **backends**, **apps**, and **packages**:

```
backends/                # Runtime adapters
  express/
  fastify/
  aws-lambda/
  cloudflare/

apps/                    # Frontend applications
  next-app/
  cli/

packages/
  functions/             # Backend domain logic (source of truth)
    src/
      functions/         # *.function.ts - See pikku-functions skill
      services/          # Service classes (Pikku-agnostic)
      config.ts          # createConfig()
      services.ts        # Service assembly
      permissions.ts     # See pikku-functions skill
      middleware.ts      # See pikku-functions skill
      errors.ts          # Project-specific errors
      *.http.ts          # See pikku-http skill
      *.channel.ts       # See pikku-channel skill
      *.queue.ts         # See pikku-queue skill
      *.schedule.ts      # See pikku-scheduler skill
      *.mcp.ts           # See pikku-mcp skill
      *.cli.ts           # See pikku-cli skill
    .pikku/
      pikku-types.gen.ts      # GENERATED - wiring surface
      pikku-services.gen.ts   # GENERATED - singleton flags
      pikku-bootstrap.gen.ts  # GENERATED - wiring loader
    package.json

  sdk/                   # (optional) Shared types/clients
    .pikku/
      pikku-fetch.gen.ts      # GENERATED - HTTP client (if configured)
      pikku-websocket.gen.ts  # GENERATED - WebSocket client (if configured)
  services/              # (optional) Infrastructure packages

package.json             # Root workspace config
pikku.config.json
yarn.lock
```

See `examples/` for configurations.

## Workspace Configuration

### Root package.json

```json
{
  "name": "my-workspace",
  "private": true,
  "workspaces": {
    "packages": [
      "packages/**",
      "apps/**",
      "backends/**"
    ]
  },
  "scripts": {
    "pikku": "pikku all && yarn workspaces foreach -p -A run pikku",
    "prebuild": "yarn run pikku && yarn workspaces foreach -p -A run prebuild",
    "tsc": "yarn workspaces foreach -p -A run tsc",
    "test": "yarn workspaces foreach -p -A run test"
  },
  "devDependencies": {
    "@pikku/cli": "^0.9.0"
  }
}
```

### functions package.json

Use workspace protocol and #imports for generated files:

```json
{
  "name": "@my-app/functions",
  "imports": {
    "#pikku/*": "./.pikku/*"
  },
  "dependencies": {
    "@my-app/sdk": "workspace:*",
    "@pikku/core": "^0.9.0"
  }
}
```

## Package Organization

### backends/

Runtime adapter hosts - each is a separate workspace package:

**Key requirements:**
- Import `pikku-bootstrap.gen` to load all wiring
- Import functions package for config and services
- Start the Pikku server

Each backend is minimal bootstrapping code. See these skills for backend-specific setup:
- **pikku-express** (todo)
- **pikku-fastify** (todo)
- **pikku-aws-lambda** (todo)
- **pikku-cloudflare** (todo)
- etc.

**General pattern:**

```typescript
// Import the Pikku adapter for your runtime
import { PikkuExpressServer } from '@pikku/express'

// Import config and services from functions package
import { createConfig } from '@my-app/functions/src/config'
import { createSingletonServices, createSessionServices } from '@my-app/functions/src/services'

// ✅ CRITICAL: Import bootstrap to load all wiring
import '@my-app/functions/.pikku/pikku-bootstrap.gen'

// Create server and start
```

### apps/

Frontend applications and CLIs:

- Import generated clients from `packages/sdk/.pikku/` (if SDK configured)
- OR generate clients locally in the app (configure in `pikku.config.json`)
- Use SDK package for shared types
- **Never import functions directly** - use clients only

```typescript
// Import from SDK package
import { createPikkuClient } from '@my-app/sdk/.pikku/pikku-fetch.gen.js'

const client = createPikkuClient({ baseURL: 'http://localhost:3000' })
```

### packages/functions/

Core backend logic - see related skills for details on each file type.

**Key points:**
- **Functions:** See **pikku-functions** skill
- **Wiring:** See **pikku-http**, **pikku-channel**, **pikku-queue**, **pikku-scheduler**, **pikku-mcp**, **pikku-cli** skills
- **Services:** Keep Pikku-agnostic (no `@pikku/*` imports in service classes)

### packages/sdk/ (Optional)

Shared types for frontend apps:
- Database types (Kysely codegen)
- Shared constants
- **No business logic**

## Service Assembly

**Location:** `packages/functions/src/services.ts`

Use `singletonServices` flags from generated file for tree-shaking:

```typescript
import { singletonServices } from '../.pikku/pikku-services.gen.js'
import type { CreateSingletonServices } from '@pikku/core'

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config) => {
  const logger = new ConsoleLogger()

  // Conditional service loading
  let kysely: Kysely<DB> | undefined
  if (singletonServices.kysely) {
    const { PikkuKysely } = await import('@pikku/kysely')
    const pikkuKysely = new PikkuKysely(logger, config.db, 'app')
    await pikkuKysely.init()
    kysely = pikkuKysely.kysely
  }

  return { logger, kysely }
}
```

**Important:** If a required service depends on an optional service, **you must handle those dependencies yourself**. Pikku doesn't manage service dependencies to keep the framework lightweight.

Example: If `kysely` (optional) needs `logger` (required), you must ensure `logger` exists before using it in `kysely` setup.

## Wiring Files

Wiring lives **next to functions** using suffix-based naming:

- `.http.ts` - HTTP routes
- `.channel.ts` - WebSocket channels
- `.queue.ts` - Queue workers
- `.schedule.ts` - Scheduled tasks
- `.mcp.ts` - MCP resources/tools/prompts
- `.cli.ts` - CLI commands

**Rules:**
- Never mix transports in one file
- Import ONLY from `#pikku/pikku-types.gen.js` + functions/permissions/middleware
- No services imports
- No business logic

See transport-specific skills for wiring details.

## Generated Files

**Never edit - regenerate with `yarn pikku`:**

In `packages/functions/.pikku/`:
- `pikku-types.gen.ts` - Wiring surface (wireHTTP, pikkuFunc, etc.)
- `pikku-services.gen.ts` - Singleton service flags for tree-shaking
- `pikku-bootstrap.gen.ts` - Wiring loader (imported by backends)

In `packages/sdk/.pikku/` (if configured in `pikku.config.json`):
- `pikku-fetch.gen.ts` - Type-safe HTTP client
- `pikku-websocket.gen.ts` - Type-safe WebSocket client
- `routes-map.gen.d.ts` - Route type definitions
- `channels-map.gen.d.ts` - Channel type definitions

Alternatively, clients can be generated directly in apps (e.g., `apps/next-app/pikku-fetch.gen.ts`)

## Tests

Place next to code under test:

```
functions/
  user/
    create-user.function.ts
    create-user.function.test.ts
```

**Integration tests:** Test domain functions directly via `createSingletonServices` - don't import wiring.

## Common Patterns

### Development Workflow

1. Write functions in `packages/functions/src/functions/`
2. Add wiring in `packages/functions/src/*.{transport}.ts`
3. Run `yarn pikku` to generate types/clients
4. Start backend: `cd backends/express && yarn start`
5. Import client in app from `@my-app/sdk/.pikku/` (or from app's local generated files)

### Backend Naming

```
backends/
  express/              # @my-app/backend-express
  fastify/              # @my-app/backend-fastify
  aws-lambda/           # @my-app/backend-lambda
```

Each imports the same `@my-app/functions` package.

## Migration from Single Package

1. Create workspace directories: `mkdir -p backends apps packages`
2. Move code to `packages/functions/`
3. Create root `package.json` with workspaces
4. Update `pikku.config.json` paths
5. Run `yarn install` to link workspaces
6. Run `yarn pikku` to regenerate

## PR Checklist

- [ ] Functions in `packages/functions/src/functions/**/*.function.ts`
- [ ] Wiring uses correct suffix and imports only from `#pikku/pikku-types.gen.js`
- [ ] No services imported in wiring files
- [ ] No business logic in wiring files
- [ ] No mixed transports in single file
- [ ] Service classes are Pikku-agnostic
- [ ] Optional services gated by `singletonServices['name']`
- [ ] Generated files not edited by hand
- [ ] Backend imports `pikku-bootstrap.gen`

## Related Skills

**Core concepts:**
- **pikku-functions** - Writing Pikku functions, permissions, middleware, RPC

**Transport wiring:**
- **pikku-http** - HTTP routes, SSE, middleware, permissions
- **pikku-channel** - WebSocket channels, connection handlers
- **pikku-queue** - Queue workers, config, error handling
- **pikku-scheduler** - Scheduled tasks, cron patterns
- **pikku-mcp** - MCP resources, tools, prompts
- **pikku-cli** - CLI commands, renderers, options

**Backend runtimes:**
- **pikku-express** (todo) - Express server setup
- **pikku-fastify** (todo) - Fastify server setup
- **pikku-aws-lambda** (todo) - AWS Lambda setup
- **pikku-cloudflare** (todo) - Cloudflare Workers setup

## Examples

See `examples/` directory for:
- pikku.config.json - Client generation configuration
- root-package.json - Workspace configuration
