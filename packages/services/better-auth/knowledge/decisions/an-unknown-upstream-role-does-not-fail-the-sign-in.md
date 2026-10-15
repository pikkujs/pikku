---
type: decision
title: An unknown upstream role does not fail the sign-in
description: A role the app has not defined is dropped with a warning and the user signs in without it, because a provisioning gap should not lock out someone who proved access
tags: better-auth, delegated-auth, roles
---

# An unknown upstream role does not fail the sign-in

In `pikkuDelegatedAuth` a role is resolved as `mapRole(identity.role) ?? identity.role`,
or `defaultRole` when the upstream sent none. It is granted by `grantRole`.

`grantRole` never throws. Its comment says an upstream role the app has not
defined "is a provisioning gap, and failing the whole sign-in over it would lock
the user out of an app they just proved they can access." Specifically:

- no role, nothing happens;
- no ScopeService, a warning, and no grant;
- a role already held, nothing happens;
- any error from `listUserRoles` or `addUserToRole`, a warning.

Roles are pikku's bags of scopes, so the grant lands in the role store, not on a
column.

**What this rules out:** failing a delegated sign-in over an undefined role, and
silently inventing a role the app did not declare.
