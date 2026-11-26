---
type: decision
title: System roles are never deleted by a deploy, but their scope set follows the declaration, and the admin API cannot change them
description: syncSystemRoles keeps a role row whose declaration has gone (marked declared false) but replaces a declared role's scope set; deleteRole and setRoleScopes refuse system roles
tags: core, scopes, roles
---

# System roles are never deleted by a deploy, but their scope set follows the declaration, and the admin API cannot change them

`syncSystemRoles` is documented in `packages/core/src/services/scope-service.ts:36-47`. It is additive for the **role row**: a role whose `defineSystemRole` declaration has gone is left in place and marked `declared: false`, so a rollback or a rolling deploy cannot strip everyone's grant.

It is **not** additive for the role's **scopes**. The same comment says "A role's scope set *is* re-synced, because that is the declaration's whole content" (`scope-service.ts:41-43`). The Kysely implementation does this by deleting the role's `pikkuRoleScopes` rows and inserting the declared ones inside one transaction (`packages/services/kysely/src/kysely-scope-service.ts:136-145`). A deploy that stops declaring a scope therefore removes it from that role. Only system rows are marked stale (`kysely-scope-service.ts:148-160`).

`deleteRole` and `setRoleScopes` throw `SystemRoleImmutableError` for a system role. Changing a system role's grants is therefore a code change plus a deploy, not an admin action at runtime. Scope sync itself (`syncScopes`) never deletes; see [scope resolution](scope-resolution-happens-at-the-session-boundary-and-sync-never-deletes.md).

**What this rules out:** an admin editing or deleting a system role through the normal role API, and a deploy deleting a system role row. It does not rule out a deploy removing a scope from a declared role. That is how a role's meaning is changed.
