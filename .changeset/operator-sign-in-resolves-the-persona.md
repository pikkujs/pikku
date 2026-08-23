---
'@pikku/better-auth': patch
'@pikku/core': patch
---

Resolve the persona to impersonate during the fabric operator sign-in.

`POST /sign-in/fabric` now takes an optional
`actAs: { email, name?, create?, role? }`
and returns `actAs: { userId }` — the stage's own id for that address, looked up
before creating and created only when asked.

It has to happen there. Impersonation names a user id, a persona only knows an
email, and since better-auth's `admin()` plugin was dropped no HTTP endpoint
lists users — so the two calls the scenario runner made to resolve one
(`/auth/admin/list-users`, then `/auth/admin/create-user`) had nothing left to
reach and every deployed persona failed with `YOU_ARE_NOT_ALLOWED_TO_LIST_USERS`.
The adapter is already in hand on the sign-in request and the operator token has
already been verified, so the lookup is free and gated by the same check that
mints the session.

A created row gets a `role` only when the caller names one. pikku has no `role`
column of its own any more, but an app may still run better-auth's `admin()`
plugin and constrain that column, so the persona's first role is passed through
for those.

`OperatorSignInOptions.adminPath` is removed; nothing points at it any more.
