---
name: pikku-middleware
description: >-
  Use when adding any middleware to a Pikku app — global HTTP middleware, tag-scoped middleware
  (including service-to-service bearer auth), per-route middleware, session-setting middleware, or
  understanding middleware execution order and priority. TRIGGER when: user wants middleware on
  some or all routes, machine-to-machine auth, tag-scoped cross-cutting concerns, global
  interceptors, or middleware priority/order questions. DO NOT TRIGGER when: user asks about
  permissions/authorization checks (use pikku-permissions), auth strategies like
  authBearer/authCookie (use pikku-security), or deployment.
installGroups: [core]
---

# Pikku Middleware

## Agent Operating Procedure

1. Discover before editing. Run `pikku info middleware --verbose` and `pikku info tags --json` to understand the existing middleware and tag landscape.
2. Identify the source files that own the behavior — wirings files, not generated output.
3. Register middleware at module load time — in a `wirings/*.ts` file, never inside a function body.
4. Validate: run `pikku all --tsc` after adding or changing middleware — it regenerates and then confirms type safety in one pass.

## The `pikkuMiddleware` Factory

```typescript
import { pikkuMiddleware } from '#pikku/function'

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

Throw a typed error to abort: `UnauthorizedError`, `ForbiddenError`, etc. from `#pikku/error`.

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
addTagMiddleware('machine-agent', [bearerAuth]) // tag on function or wire

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

addGlobalMiddleware([telemetryOuter({ environmentId: env.STAGE_ID })]) // wraps the full call
addGlobalMiddleware([telemetryInner({ environmentId: env.STAGE_ID })]) // closest to the function body
```

`telemetryOuter` ships with `priority: 'highest'`, `telemetryInner` with `priority: 'lowest'` — so priority sorting places outer first regardless of array/call order.

## HTTP & Prefix Middleware (`addHTTPMiddleware`)

```typescript
import { addHTTPMiddleware } from '@pikku/core/http'
import { cors, authBearer } from '@pikku/core/middleware'

// All routes
addHTTPMiddleware('*', [
  cors({ origin: 'https://app.example.com', credentials: true }),
])

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
import { addTagMiddleware } from '#pikku/function'

addTagMiddleware('machine-agent', [machineAgentBearerAuth])
```

Call at module load time — typically in the same `wirings/*.ts` file as the `wireHTTP` calls that use the tag.

## Middleware Execution Order

Resolution happens in two steps, and the order matters more than it looks.

**Step 1 — collect, broadest → narrowest:**

```text
global → httpGroup/* → httpGroup/prefix → wiringTags → wiringMiddleware → funcTags → funcMiddleware → function body
```

**Step 2 — sort that whole flat list by priority:**

```text
highest → high → medium (default) → low → lowest
```

**Priority is the primary key across every scope, not within one.** The collected
list is flattened first and sorted once, so a `priority: 'lowest'` global
middleware runs _after_ an inline per-route middleware of default priority — the
narrower scope does not win. Scope order survives only as the tiebreaker between
middleware of equal priority, because the sort is stable.

This is what makes `telemetryOuter`/`telemetryInner` work: they pin themselves to
`highest`/`lowest` so they bracket every other middleware no matter where those
were registered.

Set priority using the config-object form of `pikkuMiddleware`:

```typescript
const earlyMiddleware = pikkuMiddleware({
  name: 'early',
  priority: 'highest',   // 'highest' | 'high' | 'medium' | 'low' | 'lowest'
  func: async (services, wire, next) => { ... },
})
```

Within the same priority level, the collection order above is preserved. Use priority when a middleware must run before/after others regardless of where it was registered (e.g. telemetry wrapping everything, session extraction before auth checks).

## ⛔ MACHINE AUTH: THE TOKEN BECOMES A SESSION. ⛔

**A caller that has an identity — a sandbox, a deployed stage, a pool host, a device — is authenticated ONCE, in middleware, which calls `setSession`. The function is then an ordinary `pikkuFunc` gated with `scopes`. It reads `session`. It NEVER re-derives who the caller is.**

Either a function is sessionless (genuinely public) or it has a session. Anything in between — a token verified inside `func`, a token verified in a `permissions` check that returns `true`, an identity passed in the input schema, the same resolver memoised per request so N functions can each call it — is the anti-pattern this section exists to kill.

```typescript
// middleware.ts — resolve the bearer ONCE, for every route
const sandboxBearerAuth = pikkuMiddleware<SingletonServices>(
  async ({ kysely, auth }, { http, getSession, setSession }, next) => {
    if (await getSession?.()) return next()
    const header = http?.request?.header?.('authorization')
    if (!header?.startsWith('Bearer ')) return next()
    const sandbox = await resolveSandboxSession(kysely, auth, header.slice(7).trim())
    if (sandbox) {
      setSession?.({ userId: sandbox.createdByUserId ?? sandbox.sandboxInstanceId,
        orgId: sandbox.organizationId, scopes: ['machine:sandbox'], sandbox } as UserSession)
    }
    return next()
  },
)

addHTTPMiddleware('*', [cors(...), betterAuthSession(), apiBearerAuth, sandboxBearerAuth as any])
```

```typescript
// functions/report-something.function.ts
export const reportSomething = pikkuFunc({
  expose: true,
  scopes: ['machine:sandbox'],          // ← the gate. Enforced by the runner, seen by the inspector.
  input: ReportSomethingInput,
  output: ReportSomethingOutput,
  func: async ({ kysely }, input, { session }) => {
    const sandbox = sandboxOf(session)   // ← narrowing only, no verification
    ...
  },
})
```

An unresolved token leaves the session unset and the function throws `MissingSessionError` — 401, for free. Declare the scope tree once with `defineScope` (see `pikku-permissions`).

### It MUST be `addHTTPMiddleware`, never `addTagMiddleware`

**A session set in tag middleware is invisible to the function when the call arrives over `POST /rpc/:rpcName`.** Tag middleware runs inside `runPikkuFunc`, and the RPC dispatch calls it without a `sessionService`, so `invocationWire.session` is never re-read after your `setSession` — the function sees the session the OUTER wire had, which is none. `addHTTPMiddleware('*')` runs on the `/rpc` route itself, before its handler, and that session is the one the dispatched function inherits. Tag middleware is still right for a gate that only says yes/no.

### A cron is a machine identity too — set it in the task's own middleware

A scheduled task has no caller and no header, but it is still a machine principal, and without a session it cannot invoke a gated RPC or be attributed in anything it writes. Give it one the same way, in the task's own `middleware`:

```typescript
const cronSession = pikkuMiddleware(async (_services, { scheduledTask, setSession }, next) => {
  setSession?.({ userId: `cron:${scheduledTask?.name}`, scopes: ['machine:cron'] } as UserSession)
  return next()
})

wireScheduler({
  name: 'tickVirtualUserSchedules',
  schedule: '*/15 * * * *',
  middleware: [cronSession],
  func: tickVirtualUserSchedules,
})
```

One `const`, not a `machineSession(name)` factory: the inspector rejects a bare `pikkuMiddleware()` that is not assigned to a variable or object property, and the task name is on the wire anyway. Parameterised middleware goes through `pikkuMiddlewareFactory`.

The task can then be a thin `rpc.invoke('someGatedRpc')` against the same entry point a person calls, instead of factoring the logic into a `lib/` helper purely to route around the missing identity.

Unlike tag middleware over `/rpc`, this works: `runScheduledTask` builds its wire with a `sessionService`, so the session set here is the one the function is frozen with. And unlike a person, a cron is **not** a user row — inventing a seeded account for it buys a phantom member in every list, seat count and bill, and a per-org membership that a cross-org sweep has to ignore anyway. Platform-wide authority is a scope, not a membership.

### The one sessionless exception: bootstrap

An endpoint that runs BEFORE the caller has an identity — registering a new host with a shared bootstrap key, a login, a device-code request — has no session to set. That one stays `pikkuSessionlessFunc` and declares its gate in `permissions` (see `pikku-permissions`).

## Service-to-Service Bearer Auth (gate-only pattern)

Use this when the callee needs to know only THAT the caller is trusted, not WHICH caller it is. If it needs to know which, use the session pattern above.

A server that exposes RPCs only to a trusted caller (e.g. an API calling a machine-agent). Auth lives in a tag middleware — NOT in the function body. Authorization/permission checks belong in the `permissions` field (see `pikku-permissions`), never inside `func`.

**On the server (the service being called):** tag the function, register a `pikkuMiddleware` that reads the `Authorization` header on that tag.

```typescript
// lib/host-token.ts
let _token: string | null = null
export const setToken = (t: string) => {
  _token = t
}
export const getToken = () => _token
```

```typescript
// wirings/http.wiring.ts
import { timingSafeEqual } from 'node:crypto'
import { addTagMiddleware, pikkuMiddleware } from '#pikku/function'
import { UnauthorizedError } from '#pikku/error'
import { getToken } from '../lib/host-token.js'

const bearerAuth = pikkuMiddleware(async (_services, { http }, next) => {
  const authHeader =
    http?.request?.header?.('authorization') ||
    http?.request?.header?.('Authorization')
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
pikku all              # regenerate metadata so new tags are picked up
pikku all --tsc        # regenerate, then type-check (fails on type errors)
```
