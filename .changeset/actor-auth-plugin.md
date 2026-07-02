---
'@pikku/better-auth': patch
'@pikku/core': patch
---

Better Auth actor plugin for user flows: `actor({ secret })` adds an `actor`
boolean column on `user` and a `POST /sign-in/actor` endpoint (`{ email,
secret }`, constant-time compare). Actor rows are auto-created on first
sign-in; a real (non-actor) user can never be impersonated with the secret.
The flag propagates into the pikku core session (`CoreUserSession.actor`) via
both `betterAuthSession` and `betterAuthStatelessSession`, so audits and
analytics can address synthetic traffic.
