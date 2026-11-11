---
type: decision
title: Core carries virtual user roles as data and provisioning grants them
description: roles on a resolved virtual user are transported by core, never applied there — provisionVirtualUsers grants them in the running stage, through the scope service the app wired
tags: services
---

# Core carries virtual user roles as data and provisioning grants them

A virtual user's `roles` (and the `app` it signs into) are declared in
`defineVirtualUsers` and carried on `ResolvedVirtualUser`
(`packages/core/src/services/virtual-users-service.ts`) into the generated
`virtualUserConfigs`. Nothing in core reads them to grant anything:
`createHttpVirtualUsers` (`packages/core/src/wirings/virtual-user/http-virtual-users.ts`) only
signs the virtual user in.

The grant is performed by `provisionVirtualUsers`
(`packages/services/better-auth/src/provision-virtual-users.ts`), which runs in the
stage itself and calls `addUserToRole` / `addScopeToUser` on the `scopeService` the
app passes in. Its doc comment says it is additive — it creates and grants, never
deletes or revokes — and that it throws rather than grant a virtual user's roles to
an address a real user already holds.

Under `pikku dev`, where `pikkuVirtualUser` creates accounts on sign-in, the
same grant (`grantVirtualUserAccess`) runs on each sign-in when the app passes
its `scopeService` to the plugin. A deployed stage never grants on sign-in.

Core cannot do the granting: which scope store exists, whether roles have been
created, and what a role means are all the application's own. Worse, a framework
that granted scopes from wherever it was handed a virtual user would be a framework
that can escalate privileges as a side effect of signing in. Keeping the fields
inert in core makes the grant an act performed deliberately, against a store the
app wired.

**What this rules out:** teaching `createHttpVirtualUsers` (or any core service)
to call `ScopeService.addScopeToUser` / `addUserToRole` from these fields, and
treating a role listed on a virtual user declaration as evidence that the account
holds it. That evidence comes from reading the roles back
([a virtual user whose roles drift from the declaration refuses to run](a-virtual-user-whose-roles-drift-from-the-declaration-refuses-to-run.md)).
