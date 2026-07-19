---
'@pikku/cli': patch
---

Stop `pikku dev` re-inspecting the whole project a second time per hot-reload.
The addon-registry reconcile called `getInspectorState(true)` after codegen, but
`runAllWithCommandState()` had already produced a fresh post-change inspection —
the forced refresh only re-ran because codegen's file writes bumped the ts-write
generation, making the warm cache look stale. Reuse that inspection with a plain
`getInspectorState()`; the reconcile still sees the current declaration set and
addon add/delete pruning is unchanged. Cuts reload time ~35% on the e2e fixture.
