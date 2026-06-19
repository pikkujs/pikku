---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/better-auth': patch
---

Tree-shake the better-auth server out of non-auth units.

- `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
- `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
- `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.
