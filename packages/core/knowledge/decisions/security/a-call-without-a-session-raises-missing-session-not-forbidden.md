---
type: decision
title: A call without a session raises MissingSessionError, and a missing scope raises MissingScopeError
description: The function runner separates the no-session refusal from the scope and permission refusals, so a caller can tell a missing login from a denied grant
tags: core, errors, sessions, scopes
---

# A call without a session raises MissingSessionError, and a missing scope raises MissingScopeError

`resolveSession` in `packages/core/src/function/function-runner.ts` (line 64) loads a stored session when there is a user id. It throws nothing.

The refusal is in `executeFunction`. A sessionless function requires a session only when its wiring, its own config, or the addon says `auth: true` (`function-runner.ts:385-395`). That refusal throws `MissingSessionError` (`function-runner.ts:392`). A `pikkuFunc` with no session throws the same error unconditionally (`function-runner.ts:402`). The class is at `packages/core/src/errors/errors.ts:36`.

Scope checks use a different error. `verifyScopes` throws `MissingScopeError` (`packages/core/src/scopes.ts:84-86`, class at `packages/core/src/errors/errors.ts:118`).

Permission checks use `ForbiddenError` with the message `Permission denied` (`packages/core/src/permissions.ts:155`, `:166`, class at `packages/core/src/errors/errors.ts:57`).

So the three refusals are distinct: no login, a missing scope, and a failed permission function.

**What this rules out:** reporting a call with no session as a `ForbiddenError`, and reading a `ForbiddenError` from the runner as proof that a session exists but lacks a grant.
