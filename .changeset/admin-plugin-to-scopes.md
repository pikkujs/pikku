---
'@pikku/better-auth': patch
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Drop better-auth's `admin()` plugin in favour of scopes

Admin capabilities were gated on `user.role === 'admin'` — a single text column
meaning "can do everything". Impersonating a user, rebinding a shared
credential and reading the user directory are distinct capabilities that one
user can hold independently, so they are now scopes on an `admin` tree:

| Gate | Scope |
| --- | --- |
| impersonation | `admin:impersonate` |
| `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
| the console's user directory | `admin:users:list` |

Holding the bare `admin` scope satisfies all three via pikku's existing
parent-grant rule, so it is a one-for-one replacement for the old role.

`@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
`verifyScopes`, for gates that decide rather than enforce.

BREAKING: there is no role fallback. An app that relied on the old default must
register a `ScopeService` and grant `admin` (or a narrower `admin:*` scope).
Every gate fails closed and warns when no `ScopeService` is registered.
`delegatedAuth`'s `defaultRole`/`mapRole` now grant a pikku role through the
`ScopeService` instead of writing better-auth's `role` column, and the
`credentialOAuth` platform user no longer sets `banned`.
