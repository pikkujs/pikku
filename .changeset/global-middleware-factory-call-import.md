---
'@pikku/cli': patch
---

Import global middleware into deployed units when its entries are factory calls

Per-unit codegen emitted the side-effect import for an `addGlobalMiddleware`
source file only when the instance's `isFactoryCall` was false. That flag
distinguishes `mw()` from `mw` as an array element; it does not mark a
registration deferred behind an exported factory, and `addGlobalMiddleware`
registers at module evaluation under either form. A global registration written
in the ordinary way — `addGlobalMiddleware([sessionMiddleware()])` — was
therefore left out of every deployed unit and silently no-opped at runtime,
which for a session bridge or an auth gate fails open.

Every existing test for this path used the identifier form, so the guard was
never exercised.
