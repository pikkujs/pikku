---
'@pikku/better-auth': patch
---

The session middlewares stand down instead of throwing when the thing they need is not theirs to read, and no longer overwrite a session another middleware already resolved.

Two failures showed up once global middleware started reaching addon dispatches, which is exactly when this middleware began running in places it was never meant to authenticate:

- A wiring in a scoped namespace runs with a `ScopedSecretService`, and an addon's namespace is deliberately not granted the host application's `BETTER_AUTH_SECRET`. Asking for it threw `Access denied to secret key: BETTER_AUTH_SECRET`, which surfaced to the caller as a failed tool call. That is the normal state for an addon, not a fault, so the new `isSecretForbidden` predicate recognises it and the middleware skips quietly — letting a bearer-token middleware further down the chain do the authenticating. `isSecretNotFound` still logs, because a missing secret in the root namespace really is a misconfiguration.
- The middleware read `session` off its wire props to decide whether someone had already authenticated. That value is a snapshot taken when the props were built, so it stays `undefined` for the whole chain however many middlewares resolve a session in the meantime — and this one would redo its own cookie lookup over an already-authenticated request and overwrite the result. It now consults the live `getSession()` as well.

A genuine failure — the secret store being unreachable, for instance — still rejects.

`betterAuthSession` had the same problem one service along: an addon builds its own singleton services and is deliberately not handed the host application's better-auth instance, so every addon dispatch failed with `services.auth is not a function` and the caller saw a failed tool call. It now skips when no `auth` service is in scope, for the same reason and with the same outcome.
