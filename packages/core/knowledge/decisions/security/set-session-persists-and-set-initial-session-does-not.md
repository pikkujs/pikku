---
type: decision
title: setSession signs the caller in everywhere; setInitialSession only says who they are
description: Middleware and function bodies get the same session setters, so setSession always marks the session changed and writes the store, and auth middleware uses setInitialSession
tags: core, auth, session, middleware
---

# setSession signs the caller in everywhere; setInitialSession only says who they are

`createSessionAccessors` in `packages/core/src/services/user-session-service.ts`
builds the session setters for both the wire a transport hands its middleware
and the wire `runPikkuFunc` hands a function body, so one name has one meaning:

- `setSession` calls `SessionService.set`: it marks `sessionChanged`, so
  `authCookie` re-issues the cookie on the way out, and writes the session store
  under the session's `userId` when no user was resolved yet.
- `clearSession` is its counterpart for signing out.
- `setInitialSession` calls `setInitial`: the session becomes what the function
  sees, but nothing is marked changed and nothing is written.

Until 0.13 a middleware's `setSession` was bound to `setInitial` and a
function's to `set`, under one type (#1451). Middleware that signed a caller in
silently persisted nothing, and the function only saw the session because
`freezeInitial` happened to read it. `resolveSession` in
`packages/core/src/function/function-runner.ts` now reads a middleware-set
session from the session service explicitly, so that visibility is a guarantee
rather than an ordering accident (`http-runner.test.ts`, "setSession from
middleware").

The built-in auth middleware — `authCookie`, `authBearer`, `authAPIKey`,
`pikkuMeshAuthMiddleware`, `addonScopeCap`, the better-auth session
middleware and the CLI's studio and virtual-user sessions — call
`setInitialSession`, because they restore an identity the caller already holds.

**What this rules out:** auth middleware calling `setSession` to restore a
session, which would re-issue the cookie and write the store on every request,
and `addonScopeCap` narrowing through `setSession`, which would write the
narrowed scopes into the cookie and cap the user on every later request. It also
rules out binding the two wires' setters separately again.
