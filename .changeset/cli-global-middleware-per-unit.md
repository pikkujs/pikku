---
"@pikku/cli": patch
---

fix(cli): emit global middleware side-effect imports in per-unit codegen

`addGlobalMiddleware` registrations live only in `middlewareState.instances`
(keyed `global:middleware:N`) with no associated wire group. The per-unit
`--names` deploy filter strips the `state.http.files` fallback that
`add-middleware` relies on, so a globally-registered middleware was never
imported into deployed per-unit bundles and silently no-opped at runtime.

`serializeMiddlewareImports` now emits a deduped side-effect import for each
non-factory global instance into `pikku-middleware.gen.ts`, which the bootstrap
always imports — guaranteeing global middleware registers in every unit.
Duplicate imports in full builds are harmless (module bodies evaluate once).
