---
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/better-auth': patch
---

Five `console:scope*` descriptions and two `pikku *-prune` warnings promised a
grant or revoke "takes effect on their next request — no re-login". That is
only true when `withResolvedScopes` actually resolves, and it skips resolution
whenever `mapSession`/`mapKey` has already set `scopes` — which is
authoritative and deliberately never overridden.

So an app whose `mapSession` derives scopes from something like
`result.user.role` — the shape the `wire-scope` scaffold teaches — can grant a
scope from the console, see it stored, and have it never reach a session. The
revoke direction is worse: `roles prune` and `scopes prune` reported that users
lose the scopes on their next request when in fact they keep them.

Copy only; no behaviour change. The docblock on `withResolvedScopes` now states
that the propagation guarantee is conditional on resolution running at all, so
the next person copying that sentence into UI copy carries the caveat with it.
