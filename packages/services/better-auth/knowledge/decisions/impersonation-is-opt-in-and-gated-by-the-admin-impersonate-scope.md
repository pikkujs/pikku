---
type: decision
title: Impersonation is opt-in and gated by the admin impersonate scope
description: The impersonation header is ignored unless the app passes the option, and the default gate admits only a caller whose ScopeService grants admin:impersonate
tags: better-auth, impersonation, scopes
---

# Impersonation is opt-in and gated by the admin impersonate scope

The impersonation header (`x-pikku-impersonate-user-id` by default,
`DEFAULT_IMPERSONATION_HEADER`) is read only when a session middleware is
registered with an `impersonation` option. All three session middlewares
(`betterAuthSession`, `betterAuthStatelessSession`, `betterAuthStoreSession`) call
the shared `resolveImpersonatedSession` in `auth-session-impersonation.ts`.

Who may impersonate is decided by `canImpersonate`. Left unset, the default asks
whether the real caller holds `admin:impersonate` (`ADMIN_SCOPES.impersonate`)
through the registered ScopeService (`userHoldsScopes`). With no ScopeService no
one holds it, so the default denies. Supplying `canImpersonate` replaces the
default entirely.

Several cases return "no impersonation" and keep the real session: no header, the
header names the caller's own id, the gate denies, or the target does not exist.
An unknown target is logged at `warn`, not treated as an error. Errors thrown by
`canImpersonate`, `loadUser` or `mapSession` propagate to the caller.

**What this rules out:** impersonation as a default-on feature, honouring the
header without the option, letting any signed-in user impersonate, and failing
the request when the target is unknown.

Related: [An impersonated session runs with the target's rights](an-impersonated-session-runs-with-the-targets-rights.md),
[An impersonation header nobody honours is reported once](an-unhonoured-impersonation-header-is-reported-once.md).
