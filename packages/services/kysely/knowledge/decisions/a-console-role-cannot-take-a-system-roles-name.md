---
type: decision
title: A console role cannot take a system role's name
description: createRole refuses any name the store holds as a system role, and asks the pikkuRoles table rather than the declared list, so one name never answers to two roles
tags: [roles, scopes, kysely, system-roles]
---

# A console role cannot take a system role's name

`KyselyScopeService.createRole` in `packages/services/kysely/src/kysely-scope-service.ts`
throws `SystemRoleShadowedError` when `isSystemRole(role.name)` is true
(`kysely-scope-service.ts:167-170`). `isSystemRole` reads the `system` flag from the
`pikkuRoles` table for that name (`kysely-scope-service.ts:221-228`).

The method's doc comment gives the reason for asking the store rather than the generated
declaration list: the store is where a shadow would collide, and a role whose declaration
was deleted stays immutable until it is pruned (`kysely-scope-service.ts:214-220`).

The schema comment says the same refusal exists because "two rows answering to one name
would make 'does Susan hold `buyer`?' depend on which one the store returned"
(`packages/services/kysely/src/schema/scope.schema.ts:39-43`).

**What this rules out:** a console role sharing a system role's name, and checking the
name against the code's declaration list instead of the store. `deleteRole` and
`setRoleScopes` apply the same `isSystemRole` guard (`kysely-scope-service.ts:191-201`).
