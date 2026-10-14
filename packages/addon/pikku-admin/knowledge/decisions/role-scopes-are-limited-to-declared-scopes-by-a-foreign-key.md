---
type: decision
title: Role grants are limited to declared scopes by a database foreign key, not by createRole
description: scopeCreateRole does not check scope ids itself; pikkuRoleScopes has a foreign key into pikkuScopes, and the database refuses a grant of a scope that was never declared
tags: admin, scopes, kysely
---

# Role grants are limited to declared scopes by a database foreign key, not by createRole

`scopeCreateRole` (`packages/addon/pikku-admin/src/functions/scope-create-role.function.ts:11-14`)
checks nothing about the scope ids it receives. It passes them to
`scopeService.createRole`. The comment says the database enforces the vocabulary
(`scope-create-role.function.ts:12-13`).

The database does so through the schema. The `pikkuRoleScopes` table references
`pikkuScopes.name` for its `scope` column (`packages/services/kysely/src/schema/scope.schema.ts:61-64`),
and a foreign key on `scope` names the same target (`scope.schema.ts:68-72`).
The Kysely scope service's class comment states the same rule
(`packages/services/kysely/src/kysely-scope-service.ts:24-26`).

Declared scopes are upserted into that table and never deleted: a scope that is no
longer declared is marked `declared = false` (`kysely-scope-service.ts:41-46`).
A marked scope row therefore still satisfies the foreign key, so a grant can
continue to name it.

The function is gated by `admin:scopes:manage` (`scope-create-role.function.ts:10`).

**What this rules out:** a per-function list of valid scope ids in `createRole`,
and deleting a scope row to revoke its future grants.
