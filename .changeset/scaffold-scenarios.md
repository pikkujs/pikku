---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

`pikku scenario --coverage` no longer requires the console addon

The scenario instrumentation RPCs (take/reset live coverage, reset stubs, get
stub calls) previously shipped inside the console addon, so any project
without the addon silently lost scenario coverage and stub assertions — and
core's `expectService` hardcoded a `console:` RPC, assuming an addon was
installed.

A new `scaffold.scenarios` feature (`pikku enable scenarios`, or
`"scaffold": { "scenarios": "auth" }` in pikku.config.json) generates the
four functions into the project scaffold as `pikkuScenario*` exposed RPCs.
The scenario runner and `expectService` now invoke those names and the
addon copies were removed. The source-map-aware coverage mapping (and its
`@jridgewell/trace-mapping` dependency) moved from the addon into the CLI:
`@pikku/core` gains only the report types plus an optional
`CoverageService.takeReport`, which the CLI-booted coverage service
implements and the scaffolded function calls.
