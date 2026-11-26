---
type: decision
title: Grants reference declared scopes and users by foreign key
description: The scope tables tie role and user grants to pikkuScopes and to Better Auth's user table with foreign keys, so the database refuses a grant of an undeclared scope
tags: [scopes, roles, schema, kysely, foreign-keys]
---

# Grants reference declared scopes and users by foreign key

`scopeSchema` in `packages/services/kysely/src/schema/scope.schema.ts` sets these
references:

- `pikkuRoleScopes.scope` references `pikkuScopes.name` (`scope.schema.ts:63-72`).
- `pikkuUserScope.scope` references `pikkuScopes.name` (`scope.schema.ts:101-113`).
- `pikkuUserRole.role` references `pikkuRoles.name` (`scope.schema.ts:80-82`).
- `pikkuUserRole.userId` and `pikkuUserScope.userId` reference `user.id`, which Better
  Auth owns (`scope.schema.ts:77-79`, `scope.schema.ts:98-100`). The schema declares that
  requirement at `scope.schema.ts:23`.

The file's header comment explains the choice: a grant is made to a user, so the user
table must exist first (`scope.schema.ts:7-11`). The `KyselyScopeService` class comment
states that `pikku_role_scopes` FKs into `pikku_scopes`, "so the database itself refuses
to grant a scope that was never declared" (`packages/services/kysely/src/kysely-scope-service.ts:24-25`).

`syncScopes` marks scopes that are no longer declared rather than deleting them
(`kysely-scope-service.ts:41-46`), so a foreign key never loses a grant during a deploy.

**What this rules out:** storing a grant for a scope name that was never declared, and
storing a user grant that has no user row.
