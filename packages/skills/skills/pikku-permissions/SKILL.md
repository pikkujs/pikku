---
name: pikku-permissions
description: >-
  Use when deciding WHO may call a function — resource ownership, role gates, admin-only actions, or any "only their own rows" rule. Covers the `permissions` field, `pikkuPermission`, `pikkuAuth`, scopes, and where ownership belongs versus where it does not.
  TRIGGER when: writing or reviewing any function that touches a row a user owns, gating an action on a role, building the permissions half of a contract in build PHASE 2, or about to write an `if` in a function body that decides whether the caller is allowed.
  DO NOT TRIGGER when: the question is how to sign someone in or seed a persona (that is pikku-auth), or how to shape a paginated list (that is pikku-list-query).
installGroups: [core]
---

# Pikku Permissions

## The rule

**Authorization goes in the `permissions` field. Never in the `func` body.**

`permissions` runs before `func`, and it is DECLARED — `pikku meta` and the auditor can
see it. An `if` in the body is the same check, invisible: nothing can tell you which
functions are gated or how, and the next person to add a caller gets no warning.

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

## `auth: true` IS NOT OWNERSHIP — this is the one people get wrong

`auth: true` means "somebody is signed in". It does NOT mean "this row is theirs". A CRUD
function set to `auth: true` and nothing else lets ANY signed-in user delete ANY other
user's row by passing its id. Every function that takes a row id needs BOTH: `auth: true`
for the session, and a `permissions` entry for the ownership.

Equally: do NOT write an `isSignedIn` permission that returns `!!session`. That re-checks
authentication, which `auth: true` already did. A permission answers *may this user do
this* — role, ownership, tier — never *is there a session*.

## Single row vs list — where ownership actually goes

This is the distinction to get right, and both halves are correct code:

- **A function taking a row id** (`get`, `update`, `delete`) — ownership is a
  PERMISSION. Load the row, compare the owner to the session. It is a yes/no question
  about one row, which is exactly what a permission is.
- **A function returning many rows** (`list`, `search`, any stats query) — ownership is
  a `WHERE` clause in the query, because "only their rows" is a filter, not a yes/no.
  There is no permission to write here; scoping the query IS the enforcement.

A list that fetches everything and then filters in JS is a bug, not a permission.

## Writing the checkers

Put them in `src/permissions/`, one file per entity, and reuse one checker across every function on that
entity rather than writing a near-copy per function.

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
  },
)

// Session-only: no input needed. Use for role and flag gates.
export const isAdmin = pikkuAuth(async (_services, session) => session?.role === 'admin')
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

If the app has roles, the role lives on the session (see pikku-auth / `mapSession`) and
every mutating or admin-only function names it in `permissions`. Gate the FUNCTION — hiding
an admin button in the UI is UX, never enforcement, and a member who guesses the RPC name
gets straight through if the function itself is open.

## Scopes

`scopes: ['admin:invoices:void']` is an AND gate checked BEFORE permissions and before
input validation. Declare the tree once with `defineScope`; a function naming an
undeclared scope fails codegen rather than gating on nothing. A grant satisfies a scope if
it is that scope, an ancestor, or a wildcard — a session holding `admin` satisfies
`admin:invoices:void`. Most apps need roles, not scopes; reach for these only when the
plan asked for granular grants.

## The one sanctioned exception

`permissionsInBody: true` — for a check that genuinely cannot be a permission because the
identity arrives in the payload and there is no session: a webhook signature, a signed
token, an invite code. It is purely declarative and enforces nothing; its job is to tell
the auditor the openness is deliberate. Anything expressible as a permission must be one.

## After changes

`pikku all` — regenerates and typechecks the checkers. A permission whose signature is
wrong fails here, not at runtime.
