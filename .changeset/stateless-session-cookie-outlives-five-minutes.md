---
'@pikku/better-auth': patch
---

`betterAuthStatelessSession` no longer leaves the session cookie on better-auth's 300-second default, which signed every user out five minutes after they logged in.

The middleware verifies the signed `session_data` cookie with the secret alone — no `services.auth()`, no database. That is the point of it, but it also means the cookie is the only thing authenticating a request, and better-auth's unset-`maxAge` default of 300 seconds stops being a cache expiry and becomes a hard session limit. Nothing rewrites the cookie in between, because a pikku app talks to its own RPCs and never calls `/api/auth/*` again after sign-in. Five minutes in, every RPC answered 403 while the user's `session_token` was still good for a week — and because the failure is a 403 rather than a 401, a persona run watching for a 401 could not recover either (see the `HttpPersona` re-login note in `@pikku/core`, which treated the symptom).

`pikkuBetterAuth` now gives the cookie a day when, and only when, the app did not choose a lifetime itself. It is an insert, never an upsert: the check reads the app's own options object, so an explicit `maxAge` — including a short one, including an explicit `300` — is the author's decision and is left exactly as written. The default is also scoped to the configuration that needs it. Under the stateful middleware the cookie cache really is a cache in front of the database and a short life is the correct trade, so nothing changes there.

Pick your own with `session: { cookieCache: { enabled: true, maxAge: <seconds> } }`. It is worth choosing deliberately: under the stateless middleware that value is the longest a ban or a revoked session can go unnoticed, so it trades revocation latency against database reads. It is not the session length, which stays `session.expiresIn`.
