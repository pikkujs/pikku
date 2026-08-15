---
'@pikku/cli': patch
---

Give scenarios their own barrel, and stop two generated files sharing a name

`#pikku/workflow/pikku-workflow-types.gen.js` carried the whole scenario
surface — `pikkuScenario`, `pikkuScenarioStep`, `pikkuFeature`, the hooks, the
step-surface bindings and `TypedScenario`. A scenario is a testing primitive, so
every project that only ships workflows was importing it anyway. Scenarios now
live in `#pikku/scenarios/pikku-scenario-types.gen.js`, beside the scenario
bootstrap that already had its own directory, and the workflow barrel keeps only
`pikkuWorkflowFunc`, `pikkuWorkflowComplexFunc`, `pikkuWorkflowGraph`,
`TypedWorkflow` and the graph machinery.

The two barrels share exactly one name across the boundary: `TypedScenario`
extends `TypedWorkflow`, so the scenario file imports it. The config shape is
*not* shared — the workflow's own config type is private, and exporting it just
so the scenario barrel could `Omit` from it would put a name back on the public
surface to serve a generator-internal relationship. The common fields are
emitted from one definition in the generator instead.

Second fix in the same area: `pikku-personas.gen.ts` existed twice, under
`scopes/` and under `workflow/`, holding different things — `definePersonas`
in one, the runtime `TypedPersonas` in the other — which made them impossible to
tell apart by import path. The runtime one moves to
`#pikku/scenarios/pikku-personas.gen.js`, next to what uses it, and the workflow
command deletes the copy left at the old path so `tsc` does not keep compiling
a stale file nothing imports.

Also removes the `WireAddonConfig` / `WireRemoteAddonConfig` / `RemoteAddonAuth`
pass-through from the function barrel: `wireAddon` and `wireRemoteAddon` both
return `void`, so those three were parameter types with no reader.
