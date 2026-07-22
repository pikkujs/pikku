---
name: pikku-permissions
description: >-
  Use when adding authorization checks to Pikku functions — pikkuPermission, pikkuAuth,
  per-function permissions, global permissions, or understanding OR/AND permission logic.
  TRIGGER when: user wants to restrict who can call a function, check resource ownership, add
  role-based access, or understand where permission checks belong. DO NOT TRIGGER when: user asks
  about middleware or request interception (use pikku-middleware), authentication strategies (use
  pikku-security), or session management.
installGroups: [core]
---

# Pikku Permissions

## The Rule

**ALWAYS put authorization checks in the `permissions` field of `pikkuFunc` or `pikkuSessionlessFunc` — NEVER inside the `func` body.**

This includes: org access checks, repo access checks, role checks, resource ownership, and any other authorization logic. The `permissions` field runs before `func`, is visible to the inspector, and is the only place Pikku enforces authorization.

```typescript
// CORRECT
export const deleteBook = pikkuFunc({
  func: async ({ db }, { bookId }) => {
    await db.deleteBook(bookId)
  },
  permissions: {
    owner: isBookOwner, // ← authorization here
  },
})

// WRONG — permission check inside func body
export const deleteBook = pikkuFunc({
  func: async ({ db }, { bookId }, { session }) => {
    if (!session) throw new UnauthorizedError() // ← never do this
    await db.deleteBook(bookId)
  },
})
```

## Agent Operating Procedure

1. Discover before editing. Run `pikku info permissions --verbose` and `pikku info functions --verbose` to understand what permissions are already defined and applied.
2. Define permission checkers in a `src/permissions.ts` or domain-specific `src/lib/*-permissions.ts` file.
3. Apply them via the `permissions` field on the function. For an app-wide baseline that every function must additionally satisfy, use `addGlobalPermission`.
4. Validate: run `pikku all --tsc` to confirm permission checker signatures are correct.

## Permission Factories

### `pikkuAuth(fn)` — Session-Only Checks

Use for checks that only need the session — no request data required.

```typescript
import { pikkuAuth } from '#pikku'

export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)

export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)
```

### `pikkuPermission(fn)` — Data-Aware Checks

Use when authorization depends on the actual request data (e.g., resource ownership).

```typescript
import { pikkuPermission } from '#pikku'

export const isBookOwner = pikkuPermission(
  async ({ db }, { bookId }, { session }) => {
    const book = await db.getBook(bookId)
    return book?.authorId === session?.userId
  }
)

export const hasBookAccess = pikkuPermission(
  async ({ db }, { bookId }, { session }) => {
    return await db.hasAccess(session?.userId, bookId)
  }
)
```

## OR / AND Logic

```typescript
permissions: {
  admin: isAdmin,                              // OR: admins can access
  owner: isBookOwner,                          // OR: owners can access
  reviewer: [isAuthenticated, hasBookAccess],  // AND: both must pass
}
// Logic: admin OR owner OR (isAuthenticated AND hasBookAccess)
```

Groups are OR'd. Entries within a group array are AND'd.

## Where to Apply Permissions

### Per-Function (preferred)

```typescript
export const deleteBook = pikkuFunc({
  func: async ({ db }, { bookId }) => {
    await db.deleteBook(bookId)
  },
  permissions: {
    admin: isAdmin,
    owner: isBookOwner,
  },
})
```

### Global (`addGlobalPermission`) — App-Wide AND Gate

A global permission is an app-wide baseline that **every** function must additionally pass. It is an independent AND gate: it can only ever _narrow_ access — it never grants access a function's own `permissions` would deny.

```typescript
import { addGlobalPermission } from '.pikku/pikku-types.gen.js'

addGlobalPermission([signedInUser]) // every function now also requires a session
```

Multiple `addGlobalPermission` calls accumulate and are AND'd together.

> Wire-, tag-, and HTTP-route-level permissions (`addHTTPPermission`, `addTagPermission`, and a `permissions` field on HTTP/channel/MCP wirings) were **removed in #972**. Permissions now live only on the function definition, plus the optional global gate. Tags are organizational only — use tag/HTTP _middleware_ (`addTagMiddleware`, `addHTTPMiddleware`) for cross-cutting request handling, not authorization.

## The Two Gates

Authorization is two independent gates, both of which must pass:

1. **Global permissions** (`addGlobalPermission`) — AND'd together. A broad baseline that can only narrow access.
2. **The function's own `permissions`** — OR'd groups (OR-of-ANDs), as above.

The gates are independent: a broad global (e.g. `signedInUser`) can **never** satisfy an admin-only function's own requirement. Each function still enforces its own `permissions` in full.

## Complete Example

```typescript
// src/permissions.ts
import { pikkuAuth, pikkuPermission } from '#pikku'

export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)

export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)

export const isOrgMember = pikkuPermission(
  async ({ db }, { orgId }, { session }) => {
    return await db.isMember(session?.userId, orgId)
  }
)

// src/functions/org.function.ts
export const deleteOrg = pikkuFunc({
  func: async ({ db }, { orgId }) => {
    await db.deleteOrg(orgId)
  },
  permissions: {
    admin: isAdmin,
    owner: [isAuthenticated, isOrgMember],
  },
})
```

## After Changes

```bash
pikku all              # regenerate if wirings changed
pikku all --tsc        # regenerate, then verify permission checker types (fails on type errors)
```
