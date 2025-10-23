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

All domain functions **must** use the object form of `pikkuFunc` / `pikkuSessionlessFunc`.

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
pikkuSessionlessFunc<In, Out>({
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
- **Always import from generated types**: Import `pikkuFunc` and `pikkuSessionlessFunc` from `#pikku/pikku-types.gen.js`, never from `@pikku/core`

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

- **Allowed imports**: local types, `pikkuFunc` / `pikkuSessionlessFunc`, error/permission/middleware symbols
- **No wiring/adapters/env/globals** in these files
- **Private helpers** allowed if **not exported**

### Services

- Services live in `services/**` and should be **Pikku-agnostic by default**
- Service assembly happens only in `services.ts`

## Permissions

A permission is a boolean-returning guard with the same parameters as a Pikku function.

**IMPORTANT: Always use the object syntax with `name` and `description` metadata for better AI understanding and documentation.**

### Naming Convention

Permissions **must** be named using `isX` or `canX` patterns (not `requireX`):

✅ **Correct:**

- `isOwner`
- `isBoardMember`
- `canEditResource`
- `canAccessBoard`
- `isOrganizationAdmin`

❌ **Wrong:**

- `requireOwner`
- `requireBoardMember`
- `checkIfOwner`

### Defining Permissions

```typescript
export const isOwner = pikkuPermission<{
  resourceId: string
}>({
  name: 'Is Owner',
  description: 'Verifies that the current user owns the specified resource',
  func: async ({ kysely }, data, session) => {
    if (!session?.userId) return false

    const resource = await kysely
      .selectFrom('resource')
      .select(['ownerId'])
      .where('resourceId', '=', data.resourceId)
      .executeTakeFirst()

    return resource?.ownerId === session.userId
  },
})
```

Direct function syntax (discouraged):

```typescript
export const isOwner: PikkuPermission<{
  resourceId: string
}> = async ({ kysely }, data, session) => {
  if (!session?.userId) return false
  // ... same logic
}
```

### Using Permissions in Functions

**CRITICAL: Always use object syntax `permissions: { ... }` even for single permissions.**

**Single Permission:**

```typescript
export const deleteResource = pikkuFunc<{ resourceId: string }, void>({
  func: async ({ kysely }, { resourceId }) => {
    await kysely.deleteFrom('resource').where('resourceId', '=', resourceId).execute()
  },
  permissions: { isOwner },  // Object syntax, even for single permission
  docs: { ... }
})
```

**Multiple Permissions:**

When using multiple permissions, the key should be a **friendly English name** for the collection of permissions, **not a field name**:

✅ **Correct:**

```typescript
export const transferResource = pikkuFunc<{
  resourceId: string
  newOwnerId: string
}, void>({
  func: async ({ kysely }, { resourceId, newOwnerId }) => {
    // transfer logic
  },
  permissions: {
    ownership: isOwner,           // Named collection, not field name
    canTransfer: canTransferItems,
  },
  docs: { ... }
})
```

❌ **Wrong:**

```typescript
permissions: {
  resourceId: isOwner,  // DON'T use field names as keys!
}

// or

permissions: isOwner  // DON'T use bare permission without object wrapper!
```

Prefer function-level permissions; use transport-level overrides sparingly.

## Middleware

Middleware wraps a Pikku function before/after execution.

**IMPORTANT: Always use the object syntax with `name` and `description` metadata for better AI understanding and documentation.**

**CRITICAL: Always guard for the interaction type. If your middleware EXPECTS a specific interaction, throw an error instead of failing silently.**

The `interaction` object contains different properties depending on the transport:

- `interaction.http` - HTTP requests (has `method`, `path`, `headers`, etc.)
- `interaction.queue` - Queue jobs (has `queueName`, `jobId`, `updateProgress`, `fail`, `discard`)
- `interaction.channel` - WebSocket channels (has channel info)
- `interaction.scheduledTask` - Scheduled tasks
- `interaction.mcp` - MCP interactions
- `interaction.rpc` - RPC calls

**Example 1: Middleware that works across transports (with metadata):**

```typescript
export const audit = pikkuMiddleware({
  name: 'Audit Logger',
  description:
    'Logs execution time and user info for all function calls across any transport',
  func: async ({ userSession, logger }, interaction, next) => {
    const t0 = Date.now()
    try {
      await next()
    } finally {
      const userId = await userSession.get('userId').catch(() => undefined)

      // Optional: Log different info based on transport
      if (interaction.http) {
        logger?.info?.('audit', {
          method: interaction.http.method,
          path: interaction.http.path,
          userId,
          ms: Date.now() - t0,
        })
      } else if (interaction.queue) {
        logger?.info?.('audit', {
          queueName: interaction.queue.queueName,
          jobId: interaction.queue.jobId,
          userId,
          ms: Date.now() - t0,
        })
      }
    }
  },
})
```

**Example 2: Middleware that REQUIRES a specific interaction (HTTP-only, with metadata):**

```typescript
import { InvalidMiddlewareInteractionError } from '@pikku/core/errors'

export const requireHTTPS = pikkuMiddleware({
  name: 'Require HTTPS',
  description:
    'Enforces HTTPS for all HTTP requests, rejects non-HTTPS connections',
  func: async ({ logger }, interaction, next) => {
    // ✅ CRITICAL: If middleware expects HTTP, throw error if not present
    if (!interaction.http) {
      throw new InvalidMiddlewareInteractionError(
        'requireHTTPS middleware can only be used with HTTP interactions'
      )
    }

    // Now we can safely access HTTP-specific properties
    if (interaction.http.headers['x-forwarded-proto'] !== 'https') {
      throw new ForbiddenError('HTTPS required')
    }

    await next()
  },
})
```

Direct function syntax (discouraged):

```typescript
export const audit = pikkuMiddleware(
  async ({ userSession, logger }, interaction, next) => {
    // ... implementation
  }
)
```

**When to throw vs. when to guard:**

- ❌ **Silent fail**: Don't silently skip middleware logic if you need a specific interaction
- ✅ **Throw error**: If middleware is transport-specific (e.g., HTTP-only), throw `InvalidMiddlewareInteractionError`
- ✅ **Optional guard**: If middleware adapts to different transports, use `if (interaction.http)` guards

**Note:** Consider adding `InvalidMiddlewareInteractionError` to `@pikku/core/errors` (maps to 500 status code)

## userSession

The `userSession` service allows you to set and clear session data across any protocol (HTTP, WebSocket, etc.).

**Setting/upserting the session:**

```typescript
// ✅ CORRECT: Pass the entire session object to userSession.set()
// This upserts the session data
await userSession.set({ userId: user.id, role: user.role })
```

**Clearing the session (logout):**

```typescript
// ✅ CORRECT: Clear the session
await userSession.clear()
```

**Getting session values:**

```typescript
const userId = await userSession.get('userId')
const role = await userSession.get('role')
```

**Key points:**

- Use `userSession.set()` to upsert session data (login, authentication)
- Use `userSession.clear()` to clear session data (logout)
- Session data is stored in a store (local or remote, depending on your persistence strategy)
- Works across **any** protocol (HTTP, WebSocket, Queue, Scheduler, MCP)
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
- [ ] **Permissions and middleware use object syntax with `name` and `description` metadata**
- [ ] No `any` or `@ts-ignore` without justification

## Code Style

- Always use `async`/`await`; do not use `.then()`/`.catch()` for control flow
- Use `try/catch` only when there is something meaningful to handle/log; otherwise let errors bubble
