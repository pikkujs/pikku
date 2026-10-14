---
type: decision
title: Admin capabilities fail closed without a scope service
description: With no ScopeService registered, the admin gates deny everyone and log a configuration warning, so a missing wiring cannot grant impersonation or singleton credential links
tags: better-auth, scopes, admin, fail-closed
---

# Admin capabilities fail closed without a scope service

`resolvedUserHoldsScopes` (`auth-scopes.ts`) is the check behind the admin gates.
With no `ScopeService` it returns `false` and logs a warning. The warning says no
user can hold the scope, and calls it "a configuration bug, not a permissions
problem." A missing user id also returns `false`.

Callers that depend on this:

- The default impersonation gate (`auth-session-impersonation.ts`). Without a
  ScopeService nothing can be impersonated.
- The default singleton credential link gate (`credential-oauth.plugin.ts`). Its
  comment says that without a ScopeService "the default gate denies every singleton
  link."

The delegated sign-in is the exception. `grantRole` in `delegated-auth-plugin.ts`
still signs the user in when there is no ScopeService, and only skips the role
grant with a warning. That is a choice about sign-in, not about admin capability.

**What this rules out:** treating an absent scope store as permission, and any
admin gate that defaults to allow when its input is missing.
