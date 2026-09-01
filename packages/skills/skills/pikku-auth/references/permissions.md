# Pikku Permissions

## ⛔ FIRST: is the caller a machine with a token? ⛔

**Then this is NOT a permissions problem.** Resolve the token in `addHTTPMiddleware('*')` middleware that calls `setSession`, make the function a `pikkuFunc`, and gate it with `scopes`. A `permissions` check that verifies a bearer token and returns `true` is authentication wearing an authorization hat — and it leaves the function sessionless, so every body still has to work out who called it. See `references/machine-auth.md`. The only exception is a bootstrap endpoint whose caller has no identity yet (a shared-secret registration, a login): that one is sessionless and declares its gate here.

## The Rule

**ALWAYS put authorization checks in the `permissions` field of `pikkuFunc` or `pikkuSessionlessFunc` — NEVER inside the `func` body.**

This includes: org access checks, repo access checks, role checks, resource ownership, and any other authorization logic. The `permissions` field runs before `func` and is visible to the inspector, so the gate is declared rather than buried — which is what lets `pikku info permissions` and an audit see it at all. Alongside it sits `scopes` (see below) for grant-based gating; between them they are where Pikku enforces authorization. The one sanctioned exception is `permissionsInBody`, covered at the end.

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


## Permission Factories

### `pikkuAuth(fn)` — Session-Only Checks

Use for checks that read the session but need no request data — and that assert
something **beyond** merely having a session (a flag, a tier, a claim).

```typescript
import { pikkuAuth } from '#pikku/auth'

// Good: a real gate on the session's contents, not just its existence.
export const isVerified = pikkuAuth(
  async (_services, session) => !!session?.emailVerified
)
```

**Do NOT write an "is signed in" permission.** A checker that just returns
`!!session` is not authorization — it re-checks authentication, which the
function already enforces. A function that needs a signed-in user sets
`auth: true` (the default for `pikkuFunc`); it does not also carry a
`permissions: { signedIn }`.

```typescript
// WRONG — redundant with auth: true; adds a permission that gates nothing.
export const isSignedIn = pikkuAuth(async (_s, session) => !!session)
pikkuFunc({ auth: true, permissions: { signedIn: isSignedIn } /* ... */ })

// RIGHT — auth: true already requires the session; permissions are for capability.
pikkuFunc({ auth: true /* ... */ })
```

A permission answers "_may this user do this?_" (role, ownership, tier) — never
"_is there a session?_".

### `pikkuPermission(fn)` — Data-Aware Checks

Use when authorization depends on the actual request data (e.g., resource ownership).

```typescript
import { pikkuPermission } from '#pikku/auth'

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
  verified: isVerified,                    // OR: verified users can access
  owner: isBookOwner,                      // OR: owners can access
  reviewer: [isVerified, hasBookAccess],   // AND: both must pass
}
// Logic: verified OR owner OR (isVerified AND hasBookAccess)
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
    verified: isVerified,
    owner: isBookOwner,
  },
})
```

### Global (`addGlobalPermission`) — App-Wide AND Gate

A global permission is an app-wide baseline that **every** function must additionally pass. It is an independent AND gate: it can only ever _narrow_ access — it never grants access a function's own `permissions` would deny.

```typescript
import { addGlobalPermission } from '#pikku/auth'

addGlobalPermission([isEmployee]) // every function now also requires an employee session
```

Multiple `addGlobalPermission` calls accumulate and are AND'd together.

> Wire-, tag-, and HTTP-route-level permissions (`addHTTPPermission`, `addTagPermission`, and a `permissions` field on HTTP/channel/MCP wirings) were **removed in #972**. Permissions now live only on the function definition, plus the optional global gate. Tags are organizational only — use tag/HTTP _middleware_ (`addTagMiddleware`, `addHTTPMiddleware`) for cross-cutting request handling, not authorization.

## Scopes — the AND Gate Above Permissions

Scopes answer "what was this session granted?" before permissions ask "may this
user do this to this resource?". They are AND-ed: every scope listed must be
held. Because they are checked first and fail closed, a scope can only ever
_narrow_ access — it never grants what `permissions` would deny.

Declare the scope tree once with `defineScope`. The body is a no-op that
tree-shakes away; the CLI reads the call by AST and generates a `ScopeId` union,
so a function naming an undeclared scope fails the build rather than silently
gating on nothing.

```typescript
// src/scopes.ts
import { defineScope } from '#pikku/scopes'

defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Administrative access',
    scopes: {
      invoices: {
        description: 'Invoice management',
        scopes: {
          create: { description: 'Create invoices' },
          void: { description: 'Void invoices' },
        },
      },
    },
  },
  billing: {},
})
```

Every node is grantable, keyed by segment: the above yields `admin`,
`admin:invoices`, `admin:invoices:create`, `admin:invoices:void` and `billing`.
Scopes may be declared across more than one file — the declarations merge.

```typescript
export const voidInvoice = pikkuFunc({
  scopes: ['admin:invoices:void'],
  permissions: { owner: isInvoiceOwner },
  func: async ({ db }, { invoiceId }) => { ... },
})
```

A grant satisfies a required scope if it is the scope itself, an ancestor of it,
or a wildcard at any level — so a session holding `admin` satisfies
`admin:invoices:void`, and `admin:*` does too. A missing scope throws
`MissingScopeError` naming the first one that failed.

`scopes` requires a session and so is unavailable on `pikkuSessionlessFunc`:
scopes fail closed, an anonymous caller holds none, and a sessionless function
with scopes would reject every caller it exists to serve. Gate those with
`permissions`, which receive the optional session and may pass anonymous.

## The Three Gates

Authorization is three independent gates, evaluated in this order, all of which must pass:

1. **Scopes** (`scopes`) — AND'd, checked before input validation. Fails closed.
2. **Global permissions** (`addGlobalPermission`) — AND'd together. A broad baseline that can only narrow access.
3. **The function's own `permissions`** — OR'd groups (OR-of-ANDs), as above.

The gates are independent: a broad global (e.g. `isEmployee`) can **never** satisfy an admin-only function's own requirement. Each function still enforces its own `scopes` and `permissions` in full.

## The Sanctioned Exception: `permissionsInBody`

A few checks genuinely cannot be expressed as a permission — verifying a webhook
signature, a signed token, or an invite code, where the "identity" arrives in the
payload and there is no session to check. For those, declare
`permissionsInBody: true` on the function and keep the check in the body.

```typescript
export const handleStripeWebhook = pikkuSessionlessFunc({
  permissionsInBody: true,
  auth: false,
  func: async ({ stripe }, data, { http }) => {
    stripe.webhooks.constructEvent(
      data.raw,
      http.request.header('stripe-signature'),
      secret
    )
    // ...
  },
})
```

This is a last resort, and it is purely declarative — it grants nothing and
enforces nothing. Its only job is to tell the auditor that this function's
apparent openness is deliberate, so asserting it falsely disables the very check
that would have caught the mistake. It requires `"allow": { "permissionsInBody": true }`
in `pikku.config.json`, which keeps the decision visible at the project level.
Prefer `permissions` whenever the check can be expressed as one — they are
declared, inspectable, and reusable.

## Complete Example

```typescript
// src/permissions.ts
import { pikkuAuth, pikkuPermission } from '#pikku/auth'

export const isVerified = pikkuAuth(
  async (_services, session) => !!session?.emailVerified
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
    verified: isVerified,
    owner: [isVerified, isOrgMember],
  },
})
```

## After Changes

```bash
pikku all              # regenerate if wirings changed
pikku all --tsc        # regenerate, then verify permission checker types (fails on type errors)
```
