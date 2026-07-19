---
'@pikku/better-auth': patch
---

feat: resolve session scopes from a registered ScopeService

`betterAuthSession` and `betterAuthStatelessSession` now fill `session.scopes`
from the registered `ScopeService` on every path — human, machine (API key), and
impersonation. Because the session middleware already runs per request, a grant
change takes effect on the next request with no re-login and nothing to
invalidate.

A `scopes` set by `mapSession`/`mapKey` is authoritative and is never widened,
so an API key can be minted with narrower rights than the user who owns it.
Resolution is inert when no `ScopeService` is registered.
