---
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

The Rust inspector, which the CLI runs by default, now handles `live` scopes as the Go inspector does. It reads `live` from `defineScope`, refuses one that is not a literal `true` or `false`, and sets `liveScopes` on every function that requires a live scope, directly or through an ancestor. Without it a function behind a live scope ran on the session's cached grants, so with `scopesTtlSeconds` set a revoked grant kept working until the cache expired. Run `pikku all` again to rewrite the function metadata.
