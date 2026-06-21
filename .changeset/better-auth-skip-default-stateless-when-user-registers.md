---
'@pikku/inspector': patch
'@pikku/cli': patch
---

fix(better-auth): skip the auto-generated stateless session middleware when the
project registers its own. Closes #754.

With `session.cookieCache` enabled the CLI generates a global
`betterAuthStatelessSession()` using the default `{ userId }` map. Because session
middleware short-circuits once a session is set (`if (session) next()`) and the
generated file is imported before user wirings, that default-map middleware ran
first and **pre-empted** a project's own `betterAuthStatelessSession({ mapSession })`
— silently dropping custom session fields (`role`, `locale`, …).

The inspector now detects a user-owned global registration (a
`betterAuthStatelessSession(...)` call inside `addGlobalMiddleware` or the global
form of `addHTTPMiddleware` — the array form or the `'*'` pattern, not a
route-scoped `addHTTPMiddleware('/path', …)`; ignoring `.gen.ts` files and bare
standalone calls) and
sets `state.auth.userStatelessSession`. When set, the CLI skips writing
`auth-middleware.gen.ts` (and removes a stale one) so the project's own middleware
— with its custom `mapSession` — is the only one registered. Projects without a
custom map are unaffected: the default middleware is still generated.
