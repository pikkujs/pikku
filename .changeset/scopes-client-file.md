---
'@pikku/cli': minor
---

feat(cli): generate a browser-safe scope client

`clientFiles.scopesFile` emits the project's `ScopeId` union and a
`hasScopes(required, held)` with the cascade inlined, so a frontend deciding
what to render no longer imports `@pikku/core` — a server package that drags
AsyncLocalStorage and the wiring runtime into the bundle.
