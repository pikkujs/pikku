---
'@pikku/better-auth': patch
---

feat(better-auth): rewrite auth cookies for cross-site (iframe) use when
`AUTH_COOKIE_CROSS_SITE` is set.

When an app runs embedded in a cross-site iframe (e.g. a preview where the
top-level page and the app are different sites), a `SameSite=Lax` session cookie
is silently dropped by the browser — sign-in "succeeds" but the next request
arrives with no cookie, so the session never sticks.

`createAuthHandler` now rewrites every `Set-Cookie` on the auth response to
`SameSite=None; Secure; Partitioned` when `process.env.AUTH_COOKIE_CROSS_SITE`
is `true`/`1`. This is the single point every better-auth cookie flows through
(sign-in/up/out, OAuth callbacks, refresh — the session middlewares only read
cookies), so no per-app config is needed. Only the embedding runtime sets the
flag; deployed apps never do and keep the tighter `SameSite=Lax` default.
