---
type: decision
title: Scope resolution happens at the session boundary and scope sync never deletes
description: ScopeService is called when a session is built, never by the function runner, and syncScopes only ever adds — revoking is an explicit operation
tags: services
---

# Scope resolution happens at the session boundary and scope sync never deletes

Implementations of `ScopeService` (`packages/core/src/services/scope-service.ts`)
are called at the session boundary — better-auth's `mapSession`, for instance —
and never by the function runner. The runner reads `session.scopes` and performs
no I/O of its own, which is what keeps it viable on Workers and Lambda. Because
the session is rebuilt per request, a scope change takes effect on the next call:
nothing is cached and there is nothing to invalidate.

`syncScopes` is additive and never deletes. Scopes are declared in code, so a
declaration removed in a deploy would otherwise revoke a live grant the moment
the new build boots — silently, mid-rollout, for everyone holding it. Instead the
row stays and goes inert: `listScopes` reports it as `declared: false`, no
function can require it, `findStaleScopes` surfaces it for `pikku scopes audit`,
and `pikku scopes prune` is the explicit act that removes it.

**What this rules out:** having the function runner resolve scopes per call (it
would put a store round-trip in every request path and break the Workers/Lambda
story), caching resolved scopes anywhere, and making `syncScopes` reconcile —
diffing declared against stored and deleting the difference. A deploy must never
be able to revoke a grant as a side effect.
