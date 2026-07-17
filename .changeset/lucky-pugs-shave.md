---
'@pikku/core': patch
'@pikku/kysely': patch
---

feat: ScopeService.listScopes

Exposes the scope vocabulary held in the store — everything a role can be
composed from — flagging any scope that is still present but no longer declared
in code (inert, and awaiting `pikku scopes prune`).
