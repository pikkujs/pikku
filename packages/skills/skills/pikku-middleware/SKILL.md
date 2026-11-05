---
name: pikku-middleware
description: >-
  Pikku middleware: global, HTTP/prefix, tag-scoped, per-wiring; order and priority; pikkuMiddleware; setInitialSession; bearer gates. Choosing auth is pikku-auth; scopes are pikku-permissions.
installGroups: [core]
---

# Pikku Middleware

What to reach for and why. For how to call it, run this once: `pikku doc middleware pikkuMiddleware pikkuMiddlewareFactory addGlobalMiddleware addHTTPMiddleware addTagMiddleware PikkuWire telemetry`. Depth: `references/middleware-patterns.md` (the client-side `RPCInvoke` caller, setting a session from an API key, request logging and audit).

## Which level?

Broadest to narrowest. Pick the narrowest that covers the job.

- **`addGlobalMiddleware`**: every wire type (HTTP, Queue, Channel, Trigger, Scheduler, Workflow, Agent, CLI, MCP). For concerns that must wrap every invocation whatever the transport, such as telemetry.
- **`addHTTPMiddleware('*', …)`**: every HTTP route, including `/rpc`. Anything that sets a session goes here.
- **`addHTTPMiddleware('/admin/*', …)`**: one URL prefix.
- **`addTagMiddleware`**: any wiring carrying that tag, on the function or the wire object; the two tag sets merge and middleware from both runs. For a group of routes, rate limiting a group, or a yes/no gate.
- **`middleware` on a wiring or function**: one route or task.

## Rules

- Register at module load time in a `wirings/*.ts` file, never inside a function body. Tag middleware usually sits in the same file as the `wireHTTP` calls that use the tag.
- Abort by throwing a typed error from `#pikku/error` (`UnauthorizedError`, `ForbiddenError`).
- `wire.setInitialSession` says who the caller is for this request: nothing is persisted and no cookie is re-issued. It is what auth middleware calls. `wire.setSession` and `wire.clearSession` sign the caller in or out: they mark the session changed (so `authCookie` re-issues the cookie) and write the session store. Await them.
- Authorization belongs in `permissions` (`pikku-permissions`), never in `func`.
- After a change run `pikku all` to pick up new tags, or `pikku all --tsc` to regenerate and type-check.

## Order: collect, then sort by priority

Step 1 collects broadest to narrowest:

```text
global → httpGroup/* → httpGroup/prefix → wiringTags → wiringMiddleware → funcTags → funcMiddleware → function body
```

Step 2 sorts that whole flat list: `highest → high → medium (default) → low → lowest`.

**Priority is the primary key across every scope, not within one.** The list is flattened first and sorted once, so a `priority: 'lowest'` global runs _after_ an inline per-route middleware of default priority: the narrower scope does not win. Scope order survives only as the tiebreaker between equal priorities, because the sort is stable. Set priority with the config-object form of `pikkuMiddleware`, when a middleware must run before or after others wherever it was registered (telemetry wrapping everything, session extraction before auth checks).

`telemetryOuter` ships with `priority: 'highest'` and `telemetryInner` with `'lowest'`, so they bracket every other middleware regardless of array or call order.

## ⛔ MACHINE AUTH: THE TOKEN BECOMES A SESSION. ⛔

**A caller that has an identity — a sandbox, a deployed stage, a pool host, a device — is authenticated ONCE, in middleware, which calls `setInitialSession`. The function is then an ordinary `pikkuFunc` gated with `scopes`. It reads `session`. It NEVER re-derives who the caller is.**

Either a function is sessionless (genuinely public) or it has a session. Anything in between — a token verified inside `func`, a token verified in a `permissions` check that returns `true`, an identity passed in the input schema, the same resolver memoised per request so N functions can each call it — is the anti-pattern this section exists to kill.

The middleware leaves an existing session alone, reads the bearer, resolves it, calls `setInitialSession` with the identity and its scopes, and always calls `next()`. The function declares `scopes: ['machine:sandbox']` (enforced by the runner, seen by the inspector) and only narrows `session`, with no verification.

An unresolved token leaves the session unset and the function throws `MissingSessionError`: 401, for free. Declare the scope tree once with `defineScope` (see `pikku-permissions`).

### It MUST be `addHTTPMiddleware`, never `addTagMiddleware`

**A session set in tag middleware is invisible to the function when the call arrives over `POST /rpc/:rpcName`.** Tag middleware runs inside `runPikkuFunc`, and the RPC dispatch calls it without a `sessionService`, so `invocationWire.session` is never re-read after your `setInitialSession`: the function sees the session the OUTER wire had, which is none. `addHTTPMiddleware('*')` runs on the `/rpc` route itself, before its handler, and that session is the one the dispatched function inherits. Tag middleware is still right for a gate that only says yes/no.

### A cron is a machine identity too — set it in the task's own middleware

A scheduled task has no caller and no header, but it is still a machine principal, and without a session it cannot invoke a gated RPC or be attributed in anything it writes. Give it one the same way, in the `middleware` of its `wireScheduler`: a `pikkuMiddleware` that calls `setInitialSession({ userId: `cron:${scheduledTask?.name}`, scopes: ['machine:cron'] })` and returns `next()`.

- One `const`, not a `machineSession(name)` factory: the inspector rejects a bare `pikkuMiddleware()` that is not assigned to a variable or object property, and the task name is on the wire anyway. Parameterised middleware goes through `pikkuMiddlewareFactory`.
- The task can then be a thin `rpc.invoke('someGatedRpc')` against the same entry point a person calls, instead of factoring the logic into a `lib/` helper purely to route around the missing identity.
- Unlike tag middleware over `/rpc`, this works: `runScheduledTask` builds its wire with a `sessionService`, so the session set here is the one the function is frozen with.
- A cron is **not** a user row. A seeded account buys a phantom member in every list, seat count and bill, and a per-org membership that a cross-org sweep has to ignore anyway. Platform-wide authority is a scope, not a membership.

### The one sessionless exception: bootstrap

An endpoint that runs BEFORE the caller has an identity — registering a new host with a shared bootstrap key, a login, a device-code request — has no session to set. That one stays `pikkuSessionlessFunc` and declares its gate in `permissions` (see `pikku-permissions`).

## Service-to-service bearer gate

Use this when the callee needs to know only THAT the caller is trusted, not WHICH caller it is. If it needs to know which, use the session pattern above.

- Auth lives in a tag middleware, NOT in the function body. Tag the function (`auth: false`, `expose: true` on a `pikkuSessionlessFunc`) and register a `pikkuMiddleware` for that tag which reads the `Authorization` header.
- Compare with `timingSafeEqual` from `node:crypto`, after a length check, and throw `UnauthorizedError` on no expected token, no header, or a mismatch.
- The caller uses the generated `RPCInvoke` type. Never hand-write a `fetch` wrapper's types.
