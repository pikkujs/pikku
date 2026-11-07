---
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
---

Scopes can be declared `live` on any node of a `defineScope` tree (inherited by descendants, `live: false` opts a child out). The compiler flags every function that requires a live scope (a wildcard counts as its node) with `liveScopes` in its generated meta, and the runner re-reads that session's scopes from the `ScopeService` before checking them. The better-auth session middlewares take `scopesTtlSeconds` (default 0, unchanged: read on every request); above 0 a resolved scope snapshot is kept in a signed `pikku_scopes` cookie and trusted until it ages out. Scopes set by `mapSession`/`mapKey` are never replaced.
