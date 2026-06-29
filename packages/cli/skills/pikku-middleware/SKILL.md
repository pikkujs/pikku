---
name: pikku-middleware
description: 'Use when adding any middleware to a Pikku app — global HTTP middleware, tag-scoped middleware (including service-to-service bearer auth), per-route middleware, session-setting middleware, or understanding middleware execution order and priority.
TRIGGER when: user wants middleware on some or all routes, machine-to-machine auth, tag-scoped cross-cutting concerns, global interceptors, or middleware priority/order questions.
DO NOT TRIGGER when: user asks about permissions/authorization checks (use pikku-permissions), auth strategies like authBearer/authCookie (use pikku-security), or deployment.'
installGroups: [core]
---

# Pikku Middleware

## Agent Operating Procedure

1. Discover before editing. Run `pikku info middleware --verbose` and `pikku info tags --json` to understand the existing middleware and tag landscape.
2. Identify the source files that own the behavior — wirings files, not generated output.
3. Register middleware at module load time — in a `wirings/*.ts` file, never inside a function body.
4. Validate: run `pikku all` after adding or changing middleware; run `pikku tsc` to confirm type safety.

## The `pikkuMiddleware` Factory

```typescript
import { pikkuMiddleware } from '#pikku'

// Simple: just a function
const myMiddleware = pikkuMiddleware(async (services, wire, next) => {
  // runs before the function
  await next()
  // runs after the function (optional)
})

// With metadata (name + priority)
const telemetryMiddleware = pikkuMiddleware({
  name: 'my-telemetry',
  priority: 'highest',
  func: async (services, wire, next) => {
    const start = performance.now()
    try {
      await next()
    } finally {
      services.logger.info({ duration: Math.round(performance.now() - start) })
    }
  },
})
```

The `wire` object gives you:
- `wire.http` — inbound HTTP context (headers, URL, cookies)
- `wire.setSession(session)` — set the session for this request
- `wire.getSession()` — read the current session
- `wire.session` — the session set so far (may be undefined)

Throw a typed error to abort: `UnauthorizedError`, `ForbiddenError`, etc. from `@pikku/core/errors`.

## Scoping: Five Levels

From broadest to narrowest:

```typescript
// 1. Wire-agnostic global: all wire types (HTTP, Queue, Channel, Trigger, Workflow, ...)
addGlobalMiddleware([telemetryOuter()])

// 2. HTTP global: all HTTP routes
addHTTPMiddleware('*', [cors(), authBearer()])

// 3. Prefix-based: URL pattern
addHTTPMiddleware('/admin/*', [auditLog])

// 4. Tag-based: any wiring with matching tag
addTagMiddleware('machine-agent', [bearerAuth])  // tag on function or wire

// 5. Inline: per-wiring
wireHTTP({
  route: '/books/:id',
  func: getBook,
  middleware: [cacheControl],
})
```

## Global Middleware (`addGlobalMiddleware`)

Runs before everything else, across every wire type: HTTP, Queue, Channel, Trigger, Scheduler, Workflow, Agent, CLI, MCP. Use it for cross-cutting concerns (e.g. telemetry) that must wrap every invocation regardless of transport.

```typescript
import { addGlobalMiddleware } from '@pikku/core'
import { telemetryOuter, telemetryInner } from '@pikku/core/middleware'

addGlobalMiddleware([telemetryOuter({ environmentId: env.STAGE_ID })])  // wraps the full call
addGlobalMiddleware([telemetryInner({ environmentId: env.STAGE_ID })])  // closest to the function body
```

`telemetryOuter` ships with `priority: 'highest'`, `telemetryInner` with `priority: 'lowest'` — so priority sorting places outer first regardless of array/call order.

## HTTP & Prefix Middleware (`addHTTPMiddleware`)

```typescript
import { addHTTPMiddleware } from '@pikku/core/http'
import { cors, authBearer } from '@pikku/core/middleware'

// All routes
addHTTPMiddleware('*', [cors({ origin: 'https://app.example.com', credentials: true })])

// Scoped to /api/* prefix
addHTTPMiddleware('/api/*', [rateLimit({ maxRequests: 100, windowMs: 60_000 })])
```

## Tag Middleware (`addTagMiddleware`)

Tag middleware fires for any wiring (function or wire object) that carries a matching tag. This is the canonical approach for service-to-service bearer auth, rate limiting a group, or any cross-cutting concern scoped to a subset of routes.

### Setting Tags

```typescript
// On the function definition
export const myFunc = pikkuSessionlessFunc({
  auth: false,
  tags: ['machine-agent'],
  func: async (services, input) => { ... },
})

// On the wire object
wireHTTP({
  route: '/internal/action',
  method: 'post',
  auth: false,
  tags: ['internal'],
  func: myFunc,
})
```

Tags from the function definition and the wire object are merged — middleware from both tag sets runs.

### Registering Tag Middleware

```typescript
import { addTagMiddleware } from '.pikku/pikku-types.gen.js'

addTagMiddleware('machine-agent', [machineAgentBearerAuth])
```

Call at module load time — typically in the same `wirings/*.ts` file as the `wireHTTP` calls that use the tag.

## Middleware Execution Order

**Scope resolution order (broadest → narrowest):**

```text
global → httpGroup/* → httpGroup/prefix → wiringTags → wiringMiddleware → funcTags → funcMiddleware → function body
```

**Within each scope, sorted by priority:**

```text
highest → high → medium (default) → low → lowest
```

Set priority using the config-object form of `pikkuMiddleware`:

```typescript
const earlyMiddleware = pikkuMiddleware({
  name: 'early',
  priority: 'highest',   // 'highest' | 'high' | 'medium' | 'low' | 'lowest'
  func: async (services, wire, next) => { ... },
})
```

Priority is the primary sort key; within the same level, registration order is preserved. Use priority when a middleware must run before/after others regardless of registration order (e.g. telemetry wrapping everything, session extraction before auth checks).

## Service-to-Service Bearer Auth (canonical pattern)

A server that exposes RPCs only to a trusted caller (e.g. an API calling a machine-agent). Auth lives in a tag middleware — NOT in the function body. Authorization/permission checks belong in the `permissions` field (see `pikku-permissions`), never inside `func`.

**On the server (the service being called):** tag the function, register a `pikkuMiddleware` that reads the `Authorization` header on that tag.

```typescript
// lib/host-token.ts
let _token: string | null = null
export const setToken = (t: string) => { _token = t }
export const getToken = () => _token
```

```typescript
// wirings/http.wiring.ts
import { timingSafeEqual } from 'node:crypto'
import { addTagMiddleware, pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'
import { UnauthorizedError } from '@pikku/core/errors'
import { getToken } from '../lib/host-token.js'

const bearerAuth = pikkuMiddleware(async (_services, { http }, next) => {
  const authHeader = http?.request?.header?.('authorization') || http?.request?.header?.('Authorization')
  const token = getToken()
  const expected = token ? `Bearer ${token}` : null
  if (
    !expected ||
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    throw new UnauthorizedError()
  }
  return next()
})

addTagMiddleware('machine-agent', [bearerAuth])
```

```typescript
// functions/my.function.ts
export const myFunc = pikkuSessionlessFunc({
  expose: true,
  auth: false,
  tags: ['machine-agent'],
  func: async (services, input) => { ... },
})
```

**On the client (the caller):** use the generated `RPCInvoke` type — never hand-write a `fetch` wrapper's types. See `references/middleware-patterns.md`.

## More patterns

`references/middleware-patterns.md` covers the client-side `RPCInvoke` caller, session-setting middleware (set a session from an API key), and request logging / audit middleware.

## After Changes

```bash
pikku all        # regenerate metadata so new tags are picked up
pikku tsc        # type-check
```
