---
type: decision
title: User administration is decided by scopes, not a role column
description: pikku drops better-auth's admin plugin and its role column; each user-admin operation is a plain call, and the admin scope on the calling function is the only gate
tags: better-auth, admin, scopes
---

# User administration is decided by scopes, not a role column

better-auth's `admin()` plugin bundles a `role` column, fifteen HTTP endpoints
checked against that column, and the ban enforcement. pikku keeps only the last
(see [the ban decision](a-banned-user-is-refused-at-session-creation-and-lapses-on-expiry.md)).

The reason, from `admin-users.ts` and `auth-scopes.ts`: the admin endpoints were
never reachable directly. Each sat behind a pikku function with its own
`admin:users:*` scope, so `admin()` added only a second gate on `user.role`. That
column had to be kept in step with the grants it was checked against.

What replaces it:

- `admin-users.ts` exposes plain functions (`createAuthUser`, `setAuthUserPassword`,
  `setAuthUserBanned`, `deleteAuthUser`, `revokeAuthUserSessions`,
  `sendAuthUserSignInLink`). They are called from a host's own functions, so a host
  need not take an addon to use them.
- `ADMIN_SCOPES` (`auth-scopes.ts`) names the `admin:*` scopes. Every one hangs off
  the `admin` root, so a single `admin` grant covers the set. The comment calls
  this the direct replacement for `role === 'admin'`.

The comment says each RPC carries its own `admin:users:*` scope. I did not read the
addon that defines those RPCs, so that wiring is not verified here.

**What this rules out:** adding a role column back for admin checks, and a gate
that reads a projected column instead of the scope.
