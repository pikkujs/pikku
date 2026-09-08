---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Only the unit that serves `/rpc/:rpcName` retains every wired addon

`collectFilterNames` adds the `/rpc/:rpcName` scaffold name to every unit holding an exposed function, so that unit can serve its own `/rpc/<funcName>`. `filterInspectorState` read that same string back as "this unit is the generic dispatcher" and kept every wired addon's declaration for it, so almost every function unit imported each addon's whole package bootstrap.

The dispatcher is now named explicitly: the deploy pipeline passes `--rpc-catch-all` for the unit whose own handlers serve `/rpc/:rpcName`, and the filter reads `filters.rpcCatchAll` instead of inspecting `filters.names`.
