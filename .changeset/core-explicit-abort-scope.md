---
'@pikku/core': patch
---

`@pikku/core` no longer imports `node:async_hooks`, so it is edge-clean end to end. The function abort scope that `beginChanges()` observes is now passed explicitly (agent tool `execute(input, { abortScope })` onto `wire.abortScope`, carried through nested `rpc` calls) instead of living in `AsyncLocalStorage`, which also means concurrent runs in one process or isolate cannot see each other's scope. `AgentToolDef.execute` gains an optional second argument; nothing else in the public API changes.
