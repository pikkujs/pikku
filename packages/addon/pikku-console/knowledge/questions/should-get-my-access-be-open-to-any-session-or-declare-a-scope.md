---
type: question
title: Should getMyAccess stay without a declared scope when every other console function declares one?
description: getMyAccess is exposed with no scopes and no permissions, returns empty values for a session without a user, and its gate is only the session requirement of pikkuFunc
tags: console, scopes, sessions, auth
---

# Should getMyAccess stay without a declared scope when every other console function declares one?

`getMyAccess` in `packages/addon/pikku-console/src/functions/get-my-access.function.ts` is a `pikkuFunc`
with `expose: true` (lines 3-10). It declares no `scopes` and no `permissions`. Its body returns
`session?.userId ?? ''` and `session?.scopes ?? []` (lines 11-15). The description says it returns the
caller's own user id and scopes "so a UI can decide what to render" (line 9).

Its gate is therefore only the one a `pikkuFunc` has: the function runner throws `MissingSessionError` when
there is no session (`packages/core/src/function/function-runner.ts:395-403`). Past that gate, any signed-in
caller gets their own values back. The `?.` and the fallbacks suggest the body expects a session that has
no `userId` or `scopes`, which a session still can be.

Most console functions state their access rule as one `pikku:console:*` scope (see
[console functions are each gated by one declared scope](../decisions/console-functions-are-gated-by-one-declared-scope.md)).
That note records that ping and get-agent-run-scores declare none. This function is not in its list.

Question: is it intended that any signed-in session may call this, including a session that holds no console
scope at all, or should it declare a scope? The code returns only the caller's own session data, so the open
point is whether a caller with no console access should be able to reach the function.
