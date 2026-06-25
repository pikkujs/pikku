---
'@pikku/better-auth': patch
---

fix(better-auth): stop swallowing `mapSession` assertion errors

`betterAuthSession` and `betterAuthStatelessSession` wrapped the session **read**
and the caller's **`mapSession`** call in one `try/catch` that downgraded any
throw to a `logger.warn` and continued with no session. So a `mapSession` that
deliberately throws — e.g. asserting a required `role` claim is present — was
silently caught, leaving the request unauthenticated and producing a baffling
403 on every gated route (the symptom: the user's role shows correctly in a
direct `/get-session` read, yet authorized RPCs all 403).

The read now lives in its own `try` (a genuine `getSession`/cookie failure is
logged at `error` and re-thrown rather than masked), and `mapSession` runs
outside it so its errors propagate. No more silent "no session".
