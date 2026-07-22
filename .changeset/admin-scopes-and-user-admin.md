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
| reading the user directory | `admin:users:list` |
| creating a user out of band | `admin:users:create` |
| ban / unban | `admin:users:ban` |
| delete a user | `admin:users:remove` |
| revoke a user's sessions | `admin:users:sessions` |
| set a user's password | `admin:users:password` |

Holding the bare `admin` scope satisfies all of them via pikku's existing
parent-grant rule, so it is a one-for-one replacement for the old role.

better-auth's `admin()` plugin is still what implements ban, delete,
session-revocation and set-password, so it stays. Its `user.role` column is no
longer something pikku grants: it is *projected* from the scope store when a
session is built, and only from the scopes whose capability better-auth's own
endpoints gate on the caller's role. Someone granted `admin:users:list` can read
the directory — which goes straight to the auth adapter — without gaining the
power to ban, and revoking a scope demotes the role on the next sign-in. Scopes
remain the single source of truth.

New `scaffold.userAdmin` in `pikku.config.json` generates the whole set —
`pikkuAdminListUsers`, `pikkuAdminCreateUser`, `pikkuAdminSetUserBanned`,
`pikkuAdminRemoveUser`, `pikkuAdminRevokeUserSessions` and
`pikkuAdminSetUserPassword` — into your project. Listing or banning a user is
ordinary application behaviour and must not require installing the console.
Codegen fails with an actionable error if better-auth is wired without
`admin()`. The console's Users page calls these same functions, showing each
action only where the caller holds its scope.

Every scaffold now emits a directory named for its domain — `scaffold/admin/`,
`scaffold/rpc/`, `scaffold/agent/`, `scaffold/auth/`, `scaffold/console/`,
`scaffold/graph/`, `scaffold/realtime/`, `scaffold/scenarios/`,
`scaffold/webhook/`, `scaffold/workflow/` — holding its wiring file beside a
`*.schemas.gen.ts` sibling, and every generated payload is a zod schema instead
of a TypeScript generic. The schemas have to stand alone: the inspector reads a
zod schema by importing the module that declares it, which it cannot do for a
wiring file whose relative pikku-types import per-unit deploy codegen rewrites.

Resolving a schema by reference rather than by name also fixes the agent HTTP
surface. `agentCaller` and `agentStreamCaller` take the same payload but had to
repeat the type literal verbatim in each generic position, because the extractor
synthesised the schema name from the *function* name and so recorded an
`inputSchemaName` with no schema behind it whenever the two shared a named
alias — every agent call through that alias failed with `MissingSchemaError`.
One `AgentCall` schema now backs both.

Where a payload's shape belongs to `@pikku/core` (`WorkflowRunStatus`,
`FunctionCoverageReport`, `StubCall[]`) the generated function carries no
`output` schema and the inspector infers it from the handler's return type;
re-declaring a core type in zod would be a second definition free to drift.

Upgrading rewrites the layout in place: codegen prunes the pre-directory copy of
each scaffold file before it inspects the source tree, since the old flat file
still wires the same routes and leaving it behind would wire everything twice.

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

BREAKING: the console reads its user directory over the scaffolded
`pikkuAdminListUsers` RPC (gated on `admin:users:list`, backed by better-auth's
`$context.adapter`) instead of `client.admin.listUsers`, and
`UsersTableUser`/`UsersTableLabels` no longer carry `role` — there is no role
column to render. `@pikku/addon-console` no longer ships a `console:listUsers`
function: user management is not the console's job, so a host that wants the
Users page must enable `scaffold.userAdmin`.
