---
name: pikku-http
description: Guide for wiring Pikku functions to HTTP routes. Use when creating HTTP endpoints, setting up REST APIs, implementing SSE (Server-Sent Events), or configuring HTTP middleware and permissions.
---

# Pikku HTTP Wiring Skill

This skill helps you wire Pikku functions to HTTP routes using the generated adapter APIs.

## When to use this skill

- Creating HTTP endpoints (GET, POST, PUT, PATCH, DELETE)
- Setting up REST API routes
- Implementing Server-Sent Events (SSE)
- Configuring HTTP-specific middleware
- Setting up route-specific or global permissions
- Progressive enhancement with SSE

## Core Principles

The HTTP adapter is responsible for:

- Matching incoming HTTP requests to a function
- Merging path/query/body into the `data` parameter
- Enforcing `auth` and `permissions` defined on the function
- Returning typed responses or mapped `PikkuError`s

**Domain logic stays entirely in `packages/functions/src/functions/**/\*.function.ts`.\*\*

## File Naming Rules

- All HTTP wiring files must end with `.http.ts`
- Files can live anywhere under `packages/functions/src/`
- You may group multiple HTTP routes in a single file only if `agent.filePerWire` is `false` in `pikku.config.json`

Examples:

```
packages/functions/src/get-card.http.ts
packages/functions/src/cards.http.ts       # grouped HTTP routes
```

## Allowed Imports

From wiring files:

✅ **Allowed:**

- `wireHTTP`, `addHTTPMiddleware`, `addHTTPPermission` from `./pikku-types.gen.ts`
- Exported Pikku functions from `./functions/**/*.function.ts`
- `permissions` from `./permissions.ts`
- `middleware` from `./middleware.ts`
- `config` for routing prefixes or tags

❌ **Never:**

- Import from `./services/**`
- Implement business logic in wiring files

## Basic HTTP Wiring

```typescript
// packages/functions/src/get-card.http.ts
import { wireHTTP } from './pikku-types.gen.js'
import { getCard } from './functions/board.function.js'

wireHTTP({
  method: 'get', // 'get' | 'post' | 'put' | 'patch' | 'delete'
  route: '/v1/cards/:cardId',
  func: getCard,
})
```

## Per-Route Middleware

```typescript
import { wireHTTP } from './pikku-types.gen.js'
import { login } from './functions/auth.function.js'
import { persistSession } from './middleware.js'

wireHTTP({
  method: 'post',
  route: '/v1/login',
  func: login,
  middleware: [persistSession], // e.g., write Set-Cookie after login
})
```

## Global and Prefix HTTP Middleware

Use `addHTTPMiddleware` to apply middleware globally or to a route prefix.

```typescript
import { addHTTPMiddleware } from './pikku-types.gen.js'
import { cookieMiddleware, apiKeyMiddleware } from './middleware.js'

// Prefix-scoped middleware
addHTTPMiddleware('/admin', [cookieMiddleware(), apiKeyMiddleware()])

// Global middleware (no prefix)
addHTTPMiddleware([cookieMiddleware(), apiKeyMiddleware()])
```

## Permissions and Auth

HTTP wiring honors the function's own `auth` (default `true`) and `permissions`. Only override for transport-specific needs.

```typescript
import { wireHTTP } from './pikku-types.gen.js'
import { updateCard } from './functions/board.function.js'
import { requireOwner } from './permissions.js'

wireHTTP({
  method: 'patch',
  route: '/v1/cards/:cardId',
  func: updateCard,
  permissions: [requireOwner], // Optional transport-specific override
})
```

## Global and Prefix HTTP Permissions

Use `addHTTPPermission` to apply permissions globally or to a route prefix.

```typescript
import { addHTTPPermission } from './pikku-types.gen.js'
import { requireAuth, requireAdmin } from './permissions.js'

// Prefix-scoped permissions - applies to all routes starting with /admin
addHTTPPermission('/admin', {
  auth: requireAuth,
  admin: requireAdmin,
})

// Global permissions - applies to all HTTP routes
// Use '*' for global permissions
addHTTPPermission('*', {
  auth: requireAuth,
})
```

## Path, Query, and Body Parameters

- **Path params** come from `:param` syntax in route
- **Query params** are merged if they match function input names
- **Body** is parsed as JSON for non-GET methods

```typescript
// GET /v1/cards/123?includeDetails=true
wireHTTP({
  method: 'get',
  route: '/v1/cards/:cardId',
  func: getCard,
})
// → data = { cardId: '123', includeDetails: true }
```

## Server-Sent Events (SSE)

You can progressively enhance HTTP GET routes with SSE by setting `sse: true`.

**Requirements:**

- Must be a `GET` route
- A `services.channel` is injected
- For `pikkuFunc`, the channel is **optional**
- The function's `Out` type is also the SSE channel message type

```typescript
// Function with optional channel for progressive enhancement
export const progressiveEnhancementExample = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>({
  func: async (services) => {
    if (services?.channel) {
      setTimeout(() => services.channel?.send({ state: 'pending' }), 2500)
      setTimeout(() => services.channel?.send({ state: 'done' }), 5000)
    }
    return { state: 'initial' }
  },
})

// Wiring with SSE enabled
wireHTTP({
  auth: false,
  method: 'get',
  route: '/status/http',
  func: progressiveEnhancementExample,
  sse: true, // GET-only; channel sends use the Out type
})
```

## Choosing Between `pikkuFunc` and `pikkuChannelFunc`

**Progressive enhancement (HTTP + optional SSE):**

- Use **`pikkuFunc` / `pikkuSessionlessFunc`**
- The channel is **optional** (`services.channel?`)
- Works over plain HTTP
- If SSE is enabled (`sse: true`), you can send incremental updates without breaking non-SSE clients

**Always-realtime (channel must exist):**

- Use **`pikkuChannelFunc`** when the function **expects a channel to always be present**
- Dedicated WebSocket flows
- HTTP/SSE routes where the channel presence is guaranteed and required
- This makes the channel **required** in the function signature

**Need both HTTP and WS:**

- Keep business logic in a regular `pikkuFunc`
- Call it from your channel handler via `rpc.invoke(...)`
- Avoids duplication and keeps one source of truth

## Grouped HTTP Routes

```typescript
// packages/functions/src/cards.http.ts
import { wireHTTP } from './pikku-types.gen.js'
import { getCard, listCards, createCard } from './functions/board.function.js'
import { persistSession } from './middleware.js'

wireHTTP({ method: 'get', route: '/v1/cards/:cardId', func: getCard })
wireHTTP({ method: 'get', route: '/v1/cards', func: listCards })
wireHTTP({
  method: 'post',
  route: '/v1/cards',
  func: createCard,
  middleware: [persistSession],
})
```

## Wiring External RPC Endpoint

To allow external clients to invoke any exposed function via HTTP, create an RPC caller function:

```typescript
// packages/functions/src/rpc-caller.function.ts
import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const rpcCaller = pikkuSessionlessFunc<
  { name: string; data: unknown },
  unknown
>({
  func: async ({ rpc }, { name, data }) => {
    return await rpc.invokeExposed(name, data)
  },
  docs: {
    summary: 'Call any exposed function via RPC',
    tags: ['rpc'],
  },
})
```

```typescript
// packages/functions/src/rpc.http.ts
import { wireHTTP } from './pikku-types.gen.js'
import { rpcCaller } from './functions/rpc-caller.function.js'

wireHTTP({
  method: 'post',
  route: '/rpc',
  func: rpcCaller,
})
```

External clients can now call any function with `expose: true`:

```bash
POST /rpc
Content-Type: application/json

{
  "name": "calculateOrderTotal",
  "data": { "items": [...] }
}
```

## Examples

See the `examples/` directory for complete HTTP wiring examples including:

- Basic GET/POST routes
- SSE progressive enhancement
- Middleware and permissions
- Grouped routes

## Review Checklist

- [ ] File name ends in `.http.ts`
- [ ] Adapter imports come **only** from `./pikku-types.gen.ts`
- [ ] **CRITICAL**: Functions use `pikkuFunc` imported from `#pikku/pikku-types.gen.js`, never from `@pikku/core`
- [ ] **CRITICAL**: SSE routes must set `sse: true` in `wireHTTP` configuration
- [ ] Imports limited to exported functions, permissions, middleware, config
- [ ] No business logic or service imports
- [ ] Function-level `auth`/`permissions` are respected
- [ ] No manual validation or status code handling
- [ ] **Every function wired has `docs` with `summary`, `description`, `tags`, and `errors`**
- [ ] Middleware use (`wireHTTP.middleware`, `addHTTPMiddleware`) follows scope rules
- [ ] Permissions use (`wireHTTP.permissions`, `addHTTPPermission`) follows scope rules
- [ ] If `agent.filePerWire = true`, one route per file; else grouping is same-transport only
- [ ] SSE routes are `GET` only; for `pikkuFunc` the channel is optional; if you require a channel, prefer `pikkuChannelFunc`
