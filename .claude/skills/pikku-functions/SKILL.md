---
name: pikku-functions
description: Guide for writing Pikku functions following the framework's function-first, transport-agnostic approach. Use when creating domain functions, implementing RPC, setting up auth/permissions, or working with services.
---

# Pikku Functions Skill

This skill helps you write Pikku functions that are transport-agnostic, type-safe, and follow the framework's core principles.

## When to use this skill

- Creating new Pikku functions
- Refactoring existing functions to follow Pikku patterns
- Implementing domain logic in a Pikku project
- Setting up permissions, auth, or middleware for functions
- Working with RPC calls between functions
- Structuring services and function interactions

## Core Function Syntax

All domain functions **must** use the object form of `pikkuFunc` / `pikkuFuncSessionless`.

```typescript
pikkuFunc<In, Out>({
  func: async (services, data, session) => Out, // MUST be async
  permissions?: Record<string, PikkuPermission[] | PikkuPermission>,
  auth?: true | false,                          // defaults to true
  expose?: true | false,                        // if exposed as a public RPC/client API
  docs?: { summary: string; description?: string; tags?: string[]; errors?: string[] }
})
```

Sessionless variant:

```typescript
pikkuFuncSessionless<In, Out>({
  func: async (services, data) => Out, // MUST be async
  // same options (minus session usage)
})
```

## Critical Rules

### CRITICAL: Always destructure services in parameters

✅ **Correct:**

```typescript
func: async ({ kysely, eventHub }, data) => {
  // use kysely and eventHub directly
}
```

❌ **Wrong:**

```typescript
func: async (services, data) => {
  const { kysely } = services // DON'T DO THIS
}
```

### Other Core Rules

- **No manual auth checks**: Rely on `auth` (default `true`) and `permissions`/middleware
- **Errors are thrown, not returned**: Must extend `PikkuError`
- **Cross-function calls use RPC**: `rpc.invoke('<ExactExportName>', input)` — never import another Pikku function directly
- **Public APIs must set `expose: true`**: So generated client types include it
- **Always import from generated types**: Import `pikkuFunc` and `pikkuFuncSessionless` from `#pikku/pikku-types.gen.js`, never from `@pikku/core`

## RPC Usage Rules

`rpc.invoke()` is **only** for **non-trivial, reusable domain functions**:

- Orchestration
- Transactions
- Shared validation/permissions
- Cross-resource invariants
- Long-running flows

For **simple CRUD or one-service calls**, call the service directly. Do **not** wrap trivial reads/writes behind `rpc`.

✅ **Good:**

```typescript
await rpc.invoke('generateInvoice', { orderId }) // orchestrates multiple steps/rules
```

❌ **Avoid:**

```typescript
await rpc.invoke('loadCard', { cardId }) // trivial; prefer services.store.getCard(cardId)
```

This keeps call graphs clear, prevents cycles, and reduces overhead.

## Project Structure

```
packages/functions/src/
  functions/*.function.ts     # domain functions only
  services/*.ts               # service classes/interfaces (Pikku-agnostic by default)
  services.ts                 # service assembly (typed factories)
  errors.ts                   # project-specific errors (prefer importing core errors)
  permissions.ts              # PikkuPermission definitions
  middleware.ts               # PikkuMiddleware definitions
  config.ts                   # createConfig() implementation
```

### Functions (`*.function.ts`)

- **Allowed imports**: local types, `pikkuFunc` / `pikkuFuncSessionless`, error/permission/middleware symbols
- **No wiring/adapters/env/globals** in these files
- **Private helpers** allowed if **not exported**

### Services

- Services live in `services/**` and should be **Pikku-agnostic by default**
- Service assembly happens only in `services.ts`

## Permissions

A permission is a boolean-returning guard with the same parameters as a Pikku function.

```typescript
export const requireOwner: PikkuPermission<{
  resourceOwnerId: string
}> = async ({ ownership }, data, session) => {
  if (!session?.userId) return false
  return ownership.isOwner(session.userId, data.resourceOwnerId)
}
```

Attach permissions to functions via the `permissions` property. Prefer function-level permissions; use transport-level overrides sparingly.

## Middleware

Middleware wraps a Pikku function before/after execution.

```typescript
export const audit: PikkuMiddleware = async (
  { userSession, logger },
  interaction,
  next
) => {
  const t0 = Date.now()
  try {
    await next()
  } finally {
    const userId = await userSession.get('userId').catch(() => undefined)
    logger?.info?.('audit', {
      route: interaction.route,
      userId,
      ms: Date.now() - t0,
    })
  }
}
```

## userSession

- Set session attributes inside **any** protocol using the `userSession` service
- Persistence is provided by transport middleware (e.g., HTTP cookies)
- Do not manually check for session presence in functions; rely on `auth` and permissions

## EventHub (transport-agnostic pub/sub)

Use **EventHub** for topic-based fan-out across channels, SSE, queues, or internal events.

```typescript
await eventHub.subscribe(topic, channel.channelId)
await eventHub.unsubscribe(topic, channel.channelId)
await eventHub.publish(topic, null, payload) // broadcast to all
await eventHub.publish(topic, channel.channelId, payload) // exclude/target (adapter dependent)
```

## Required Documentation

Every function includes a `docs` block:

```typescript
docs: {
  summary: 'Fetch a card',
  description: 'Returns a card by ID',
  tags: ['cards'],
  errors: ['NotFoundError'],
}
```

## Examples

See the `examples/` directory for complete function examples including:

- Basic read function (exposed RPC)
- Mutation using RPC for orchestration
- Sessionless health check
- Permission guards
- Middleware usage

## Review Checklist

When creating or reviewing Pikku functions:

- [ ] Files live under `packages/functions/src/` with `.function.ts` suffix
- [ ] Functions are async and **destructure services IN THE PARAMETER LIST**
- [ ] No wiring/adapters/env/globals inside function files
- [ ] `rpc.invoke` used **only** when non-trivial reuse is intended
- [ ] Services are Pikku-agnostic by default and assembled in `services.ts`
- [ ] Errors extend `PikkuError`
- [ ] Every function has a `docs` block
- [ ] No `any` or `@ts-ignore` without justification

## Code Style

- Always use `async`/`await`; do not use `.then()`/`.catch()` for control flow
- Use `try/catch` only when there is something meaningful to handle/log; otherwise let errors bubble
