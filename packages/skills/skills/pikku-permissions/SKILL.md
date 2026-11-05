---
name: pikku-permissions
description: >-
  Who may call a function: ownership, roles, "only their own rows": `permissions`, pikkuPermission, pikkuAuth, scopes, MissingScopeError. Open before an `if` on the caller in a body. Sign-in is pikku-auth.
installGroups: [core]
---

# Pikku Permissions

## First: is the caller a machine with a token?

Then this is NOT a permissions problem. Resolve the token in `addHTTPMiddleware('*')` middleware that calls `setInitialSession`, make the function a `pikkuFunc`, and gate it with `scopes` (pikku-auth, `../pikku-auth/references/machine-auth.md`). A `permissions` check that verifies a bearer token and returns `true` is authentication in disguise, and leaves the function sessionless. The only exception is a bootstrap endpoint whose caller has no identity yet (a shared-secret registration, a login): it is sessionless and declares its gate here.

## The rule

**Authorization goes in the `permissions` field. Never in the `func` body.**

`permissions` runs before `func` and is DECLARED: `pikku meta` and the auditor can see it. An `if` in the body is the same check, invisible.

```typescript
// RIGHT
export const deleteBook = pikkuFunc({
  permissions: { owner: isBookOwner },
  func: async ({ kysely }, { bookId }) => {
    await kysely.deleteFrom('book').where('bookId', '=', bookId).execute()
  },
})

// WRONG — the gate is buried in the body
export const deleteBook = pikkuFunc({
  func: async ({ kysely }, { bookId }, { session }) => {
    const book = await kysely.selectFrom('book')...executeTakeFirst()
    if (book?.ownerId !== session.userId) throw new UnauthorizedError()
    await kysely.deleteFrom('book').where('bookId', '=', bookId).execute()
  },
})
```

## `auth: true` IS NOT OWNERSHIP

`auth: true` means "somebody is signed in", not "this row is theirs". With nothing else, ANY signed-in user can delete ANY other user's row by passing its id. Every function that takes a row id needs BOTH: `auth: true` for the session and a `permissions` entry for ownership.

Do NOT write an `isSignedIn` permission returning `!!session`; `auth: true` already did that. A permission answers _may this user do this_ (role, ownership, tier), never _is there a session_.

## Single row vs list: where ownership goes

- **A function taking a row id** (`get`, `update`, `delete`): ownership is a PERMISSION. Load the row, compare the owner to the session.
- **A function returning many rows** (`list`, `search`, any stats query): ownership is a `WHERE` clause. There is no permission to write; scoping the query IS the enforcement.

A list that fetches everything and then filters in JS is a bug, not a permission.

## Writing the checkers

Put them in `src/permissions/`, one file per entity, and reuse one checker across every function on that entity.

```typescript
// src/permissions/book.ts
import { pikkuPermission, pikkuAuth } from '#pikku/auth'

// Data-aware: gets the input, so it can load the row the caller named.
export const isBookOwner = pikkuPermission(
  async ({ kysely }, { bookId }, { session }) => {
    const book = await kysely
      .selectFrom('book')
      .select('ownerId')
      .where('bookId', '=', bookId)
      .executeTakeFirst()
    return book?.ownerId === session?.userId
  }
)

// Session-only: no input needed. Use for role and flag gates.
export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)
```

## OR and AND

```typescript
permissions: {
  owner: isBookOwner,            // OR — an owner may
  admin: isAdmin,                // OR — an admin may
  editor: [isAdmin, isBookOwner] // AND — both, inside one group
}
```

Groups are OR'd; entries inside a group array are AND'd.

## Roles

If the app has roles, the role lives on the session (see pikku-auth / `mapSession`) and every mutating or admin-only function names it in `permissions`. Gate the FUNCTION: hiding an admin button is UX, never enforcement.

## Scopes

`scopes: ['admin:invoices:void']` is an AND gate checked BEFORE permissions and before input validation. Naming an undeclared scope fails codegen. A grant satisfies a scope if it is that scope, an ancestor, or a wildcard. Most apps need roles, not scopes; use these only when the plan asked for granular grants. The `defineScope` tree, grant matching and the sessionless restriction: [references/scopes.md](references/scopes.md).

## Global permissions

`addGlobalPermission([isEmployee])` (from `#pikku/auth`) is an app-wide baseline every function must additionally pass. It can only narrow access, never grant what a function's own `permissions` would deny. Multiple calls accumulate and are AND'd.

## The three gates

All must pass, in this order:

1. **Scopes** (`scopes`): AND'd, checked before input validation, fails closed.
2. **Global permissions** (`addGlobalPermission`): AND'd together, a baseline that only narrows.
3. **The function's own `permissions`**: OR'd groups of AND'd entries.

They are independent: a broad global (e.g. `isEmployee`) can never satisfy an admin-only function's own requirement. Wire-, tag- and HTTP-route-level permissions (`addHTTPPermission`, `addTagPermission`, a `permissions` field on a wiring) no longer exist; tags are organizational only. Use tag/HTTP middleware for cross-cutting request handling, not authorization.

## The one sanctioned exception

`permissionsInBody: true` is for a check that cannot be a permission because the identity arrives in the payload and there is no session: a webhook signature, a signed token, an invite code. It is purely declarative and enforces nothing; it tells the auditor the openness is deliberate. Anything expressible as a permission must be one.

## After changes

`pikku all --tsc` regenerates, then verifies the checker types. A wrong permission signature fails here, not at runtime.
