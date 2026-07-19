---
'@pikku/console': patch
---

Add a Scopes admin surface to the console.

A new **Scopes** page (beside Users) with two tabs:

- **Roles** — list the admin-composed roles and edit each one in a drawer that
  composes it from the declared scope vocabulary. Create and delete roles.
- **Scopes** — a read-only view of the vocabulary declared in code via
  `wireScope`, flagging any scope that is stored but no longer declared (inert,
  and what `pikku scopes prune` removes).

The **Users** page gains a per-row **Roles** action opening a drawer to grant
and revoke a user's roles, with the resolved scope union shown read-only.

All backed by the console addon's scope RPCs (`scopeListRoles`,
`scopeListDeclared`, `scopeListUserRoles`, `scopeCreateRole`,
`scopeSetRoleScopes`, `scopeDeleteRole`, `scopeAddUserToRole`,
`scopeRemoveUserFromRole`).
