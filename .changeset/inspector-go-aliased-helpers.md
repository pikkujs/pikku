---
'@pikku/inspector-go': patch
---

The native inspector identifies pikku helpers by what their callee resolves to, as the TypeScript inspector does, so `import { addTagMiddleware as guard }` and `mw.addTagMiddleware(...)` register their middleware (and aliased `pikkuFunc`, `pikkuPermission`, `pikkuBetterAuth` calls are seen). A channel's unexported `onConnect`/`onDisconnect` handler gets its function metadata, so its contract is recorded.

A middleware or permission helper passed around as a value is reported as PKU577, as in the TypeScript inspector, rather than generating an app whose gate never runs.

A CLI option's choices derived from a string-literal union come out in the TypeScript inspector's order (type-id order) instead of typescript-go's value order.
