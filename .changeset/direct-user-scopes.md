---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

feat(scopes): grant scopes directly to a user, not only through roles

A scope can now be granted to a user directly, outside of any role.
`resolveScopes` returns the union of a user's role-derived scopes and their
direct grants, so a one-off capability no longer requires inventing a role.

- `@pikku/core`: `ScopeService` gains `addScopeToUser` / `removeScopeFromUser` /
  `listUserScopes`.
- `@pikku/kysely`: a new `pikku_user_scope` table (FK into `pikku_scopes`, so the
  database still refuses an undeclared grant; `ON DELETE CASCADE` from `user`,
  so deleting a user takes their direct grants with it). `resolveScopes` unions
  it with the role join.
- `@pikku/addon-console`: `scopeAddScopeToUser` / `scopeRemoveScopeFromUser`
  (gated by `pikku:scopes:manage`), and `scopeListUserRoles` now also returns
  `directScopes`.
- `@pikku/console`: a **Direct scopes** section in the user roles drawer to grant
  and revoke scopes directly, showing them distinctly from the resolved union.

Also: the Scopes page now distinguishes a permission error (a console admin
without `pikku:scopes:read`) from an actual scope-service outage, instead of
showing "the scope service may be unavailable" for both.
