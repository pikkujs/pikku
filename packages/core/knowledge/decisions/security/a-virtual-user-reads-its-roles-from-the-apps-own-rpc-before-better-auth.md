---
type: decision
title: A virtual user reads its roles from the app's own RPC before better-auth's user.role
description: sessionRoles asks getMyScopes first, then get-session, and returns null rather than an empty list when the stage reports no roles
tags: core, virtual-users, auth
---

# A virtual user reads its roles from the app's own RPC before better-auth's user.role

`HttpVirtualUser.sessionRoles` (`packages/core/src/wirings/virtual-user/http-virtual-users.ts`) answers
"what roles does this session hold" in a fixed order. First the app's exposed RPC,
which defaults to `getMyScopes` and can be renamed or switched off with `rolesRpc`.
Only then better-auth's `get-session`, where its admin plugin puts `role` on the
user.

The `rolesRpc` doc comment gives the reason. In an app that authorizes on scopes,
`user.role` is "a projection rather than the model": it exists so better-auth's
admin endpoints have something to read, and it may be absent. A virtual user verified
against it is verified against a copy.

Two answers are kept apart. A stage that answers neither returns `null`, which
means "this stage does not report roles". A session that carries a user with no
role field returns `[]`, which means "this person has none". The doc comment says
the two call for opposite responses from the caller.

**What this rules out:** making better-auth's `user.role` the first source of a
virtual user's roles, and reporting `[]` for a stage that could not answer at all.
