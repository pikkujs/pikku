---
type: decision
title: Only roles prune removes an undeclared system role
description: roles audit and roles prune both read the declared set, but only prune deletes, and only with --yes; audit points the person to prune
tags: cli, roles, auth
---

# Only roles prune removes an undeclared system role

`rolesPrune` in `packages/cli/src/functions/commands/roles-prune.ts` is the one
command that deletes an undeclared system role and cascades it out of user grants.
The comment says this revokes access, so it never runs at boot or inside `pikku all`
(`roles-prune.ts:8-16`).

Without `--yes` it reports the blast radius and stops (`roles-prune.ts:48-57`).
With `--yes` it calls `pruneSystemRoles` (`roles-prune.ts:59`) and warns that
the users lose the role's scopes on their next request, unless `mapSession` sets
scopes itself (`roles-prune.ts:62-66`).

`rolesAudit` in `packages/cli/src/functions/commands/roles-audit.ts` lists the same
stale roles and their holders. It does not delete. It warns that undeclared roles
are inert but still held, and tells the person to run `pikku roles prune --yes`
(`roles-audit.ts:41-50`). Audit still opens the scope service through
`openScopeServiceForRoles`, which syncs declared roles additively
(`packages/cli/src/functions/commands/roles-shared.ts:99-100`).

**What this rules out:** deleting a role as a side effect of deploy or of reading
the list, and a second revoke command.
