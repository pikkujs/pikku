---
'@pikku/kysely': patch
---

feat: KyselyScopeService — resolve and administer user scopes

Adds `KyselyScopeService`, backing the core `ScopeService` interface with four
self-created tables: `pikku_scopes`, `pikku_roles`, `pikku_role_scopes` and
`pikku_user_role`.

Scopes are declared in code and synced additively — a scope that is no longer
declared is marked, never deleted, so a rename or a rolling deploy cannot
silently revoke a grant. `pikku scopes prune` is the deliberate removal path.
Roles are data, composed by admins at runtime, and `pikku_role_scopes` has a
foreign key into `pikku_scopes`, so the database itself refuses to grant a
scope that was never declared.
