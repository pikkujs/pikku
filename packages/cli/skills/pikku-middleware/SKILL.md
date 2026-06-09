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

`addGlobalMiddleware` registers middleware that runs before everything else — across every wire type: HTTP, Queue, Channel, Trigger, Scheduler, Workflow, Agent, CLI, MCP. Use it for cross-cutting concerns like telemetry that must wrap every invocation regardless of transport.

```typescript
import { addGlobalMiddleware } from '@pikku/core'
import { telemetryOuter, telemetryInner } from '@pikku/core/middleware'

// Outer telemetry: wraps the full call (highest priority)
addGlobalMiddleware([telemetryOuter({ environmentId: env.STAGE_ID })])

// Inner telemetry: closest to the function body (lowest priority)
addGlobalMiddleware([telemetryInner({ environmentId: env.STAGE_ID })])
```

`telemetryOuter` ships with `priority: 'highest'` and `telemetryInner` with `priority: 'lowest'` — so even if both are added in the same call, priority sorting places outer first regardless of array order.

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

Within the same priority level, registration order is preserved. Priority is the primary sort key — use it when a middleware must run before or after others regardless of registration order (e.g. telemetry wrapping everything, session extraction before auth checks).

## Common Patterns

### Service-to-Service Bearer Auth

The canonical pattern for a server that exposes RPCs only to a trusted caller (e.g. an API calling a machine-agent):

**On the server (the service being called):**

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

**On the client (the caller):**

Use the generated `RPCInvoke` type from `.pikku/rpc/pikku-rpc-wirings-map.gen.d.ts` — never hand-write the input/output types:

```typescript
import type { RPCInvoke } from '../../backends/my-service/.pikku/rpc/pikku-rpc-wirings-map.gen.d.js'

export function getServiceRPC(baseUrl: string, token: string): RPCInvoke {
  return async (name: string, data?: unknown) => {
    const res = await fetch(`${baseUrl}/rpc/${String(name)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data: data ?? {} }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`rpc ${String(name)} failed: ${res.status} ${text}`)
    }
    return res.json()
  } as RPCInvoke
}
```

### Session-Setting Middleware

```typescript
const apiKeyAuth = pikkuMiddleware(async ({ kysely }, { http, setSession, session }, next) => {
  if (session) return next()  // already authenticated

  const header = http?.request?.header?.('x-api-key')
  if (!header) return next()

  const row = await kysely.selectFrom('apiKey').select('userId').where('key', '=', header).executeTakeFirst()
  if (row) setSession?.({ userId: row.userId })

  return next()
})

addTagMiddleware('api-key-auth', [apiKeyAuth])
```

Functions tagged `'api-key-auth'` with `auth: true` reject requests without a valid key; those with `auth: false` can inspect the session but won't reject.

### Request Logging / Audit

```typescript
const auditLog = pikkuMiddleware(async ({ logger, db }, wire, next) => {
  const start = Date.now()
  await next()
  await db.createAuditLog({ duration: Date.now() - start })
})

addHTTPMiddleware('/admin/*', [auditLog])
```

## After Changes

```bash
pikku all        # regenerate metadata so new tags are picked up
pikku tsc        # type-check
```
