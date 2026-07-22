---
'@pikku/better-auth': patch
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Gate admin capabilities on scopes, and scaffold user management

Admin capabilities were gated on `user.role === 'admin'` — a single text column
meaning "can do everything". Impersonating a user, rebinding a shared
credential and reading the user directory are distinct capabilities that one
user can hold independently, so they are now scopes on an `admin` tree:

| Gate | Scope |
| --- | --- |
| impersonation | `admin:impersonate` |
| `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
| the console's user directory | `admin:users:list` |
| ban / unban | `admin:users:ban` |
| delete a user | `admin:users:remove` |
| revoke a user's sessions | `admin:users:sessions` |
| set a user's password | `admin:users:password` |

Holding the bare `admin` scope satisfies all of them via pikku's existing
parent-grant rule, so it is a one-for-one replacement for the old role.

better-auth's `admin()` plugin is still what implements ban, delete,
session-revocation and set-password, so it stays. Its `user.role` column is no
longer something pikku grants: it is *projected* from the scope store when a
session is built, and only from the user-management subtree. Someone granted
`admin:users:list` can read the directory without gaining the power to ban, and
revoking the scope demotes the role on the next sign-in. Scopes remain the
single source of truth.

New `scaffold.userAdmin` in `pikku.config.json` generates
`pikkuAdminSetUserBanned`, `pikkuAdminRemoveUser`,
`pikkuAdminRevokeUserSessions` and `pikkuAdminSetUserPassword` into your
project — banning a user is ordinary application behaviour and must not require
installing the console. Codegen fails with an actionable error if better-auth is
wired without `admin()`. The console's Users page calls these same functions,
showing each action only where the caller holds its scope.

`@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
`verifyScopes`, and declares `auth` on `CoreSingletonServices` — the auth
instance the generated `pikkuServices` wrapper already injected but never typed.
A scope root declared twice (an addon and its host both contributing the same
`admin` tree) now flattens to one entry per id instead of emitting it twice.

BREAKING: there is no role fallback for the scope-gated capabilities. An app
that relied on the old default must register a `ScopeService` and grant `admin`
(or a narrower `admin:*` scope). Every gate fails closed and warns when no
`ScopeService` is registered. `delegatedAuth`'s `defaultRole`/`mapRole` now
grant a pikku role through the `ScopeService` instead of writing better-auth's
`role` column, and the `credentialOAuth` platform user no longer sets `banned`.

BREAKING: the console reads its user directory over the new `console:listUsers`
RPC (gated on `admin:users:list`, backed by better-auth's `$context.adapter`)
instead of `client.admin.listUsers`, and `UsersTableUser`/`UsersTableLabels` no
longer carry `role` — there is no role column to render.
