---
type: decision
title: Hot reload merges generated meta and never replaces it
description: Reloading codegen output must preserve runtime-registered meta, which no generated JSON contains
tags: core
---

# Hot reload merges generated meta and never replaces it

`reloadGeneratedMeta` in `packages/core/src/dev/reload-meta.ts` re-reads the
codegen output (`.pikku/**/​*.gen.json`) straight into `pikkuState` after each dev
codegen pass. It reads the JSON directly rather than re-importing the generated
`*-meta.gen.ts` wrappers because the ESM cache pins both the wrapper and its JSON
import, so a re-import returns the stale value.

For `function.meta` and `queue.meta` it merges over the existing map instead of
assigning. Framework internals are registered at service-init time and appear in
no generated file: `pikkuWorkflowOrchestrator` and the per-workflow
`wf-orchestrator-*` / `wf-step-*` queue workers are added by
`pikku-workflow-service.ts`. A wholesale replace drops them, and the next
workflow job fails with `Function meta not found: pikkuWorkflowOrchestrator`.
`dev/reload-meta.test.ts` pins this. Meta maps that only codegen ever writes
(`http`, `rpc`, `agent`) are assigned outright.

Two limits are inherent rather than incidental. Routes registered by a _new_
`wireHTTP` file are not picked up here — those modules were never imported — which
is why `hot-reload.ts` keeps a `postCodegenQueue` and exposes `reimportPending()`
for the dev server to drain after codegen, so registrations that were skipped for
missing meta run again against fresh meta. And `reconcileAddonRegistry` has to
prune `addons.packages` explicitly, because hot reload only ever re-imports files
that still exist, so a deleted `*.addon.ts` would otherwise leave its `wireAddon`
entry stranded until a restart.

**What this rules out:** replacing the two merges with plain
`pikkuState(null, 'function', 'meta', functionsMeta)` assignments on the grounds
that codegen output is authoritative — it is authoritative only for what codegen
emits. It also rules out folding `reimportPending()` back into the debounced
reload (the whole point is that it runs _after_ codegen), and dropping
`reconcileAddonRegistry` as dead code.
