---
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

**Breaking:** `setSession` now means the same in middleware as in a function body (#1451). It marks the session changed — so `authCookie` re-issues the cookie on the way out — and writes the session store under the session's `userId`. Until now a middleware's `setSession` only set the session for the request, under the same name and type.

Middleware that works out who the caller is from a credential it was handed (a cookie, a bearer token, an API key) should call the new `setInitialSession` instead. It sets the session the function sees without marking it changed or writing anything:

```diff
-const apiKeyAuth = pikkuMiddleware(async ({ db }, { http, setSession, session }, next) => {
+const apiKeyAuth = pikkuMiddleware(async ({ db }, { http, setInitialSession, session }, next) => {
   if (session) return next()
   const row = await db.findKey(http?.request?.header('x-api-key'))
-  if (row) await setSession?.({ userId: row.userId })
+  if (row) setInitialSession?.({ userId: row.userId })
   return next()
 })
```

Left on `setSession`, such a middleware re-issues the auth cookie and writes the session store on every request. Middleware that genuinely signs someone in keeps `setSession`, and now persists. `clearSession` is on the middleware wire too.

`authCookie`, `authBearer`, `authAPIKey`, `pikkuRemoteAuthMiddleware`, `addonScopeCap`, the better-auth session middleware and the CLI's studio and virtual-user sessions all use `setInitialSession`. `SessionService.set` stores a session under its own `userId` when no user was resolved yet, so a sign-in is persisted rather than dropped, and the function runner reads a middleware-set session from the session service explicitly rather than through the order `freezeInitial` happens to run in.
