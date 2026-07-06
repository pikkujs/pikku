---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/schema-cfworker': patch
---

fix dev-server hot reload so edited AND new functions/routes apply without a restart

- `@pikku/core`: the hot reloader fed raw zod `input`/`output` schemas into the JSON-schema map, so `compileAllSchemas` threw `Failed to compile schema` on every reload and the reload aborted (only the function body sometimes swapped, half-updated). It now registers function implementations only and leaves schemas to the codegen JSON output. New function exports are registered too (previously only already-registered names were replaced). Reloads write into the startup functions map directly to avoid a race with the dev watcher's codegen-scoped state swap, and re-import via a uniquely-named sibling copy since neither Bun nor tsx bust the module cache on a `?t=` query.
- New `reloadGeneratedMeta` (exported from `@pikku/core/dev`) re-reads the regenerated wiring meta + JSON schemas into the running process so new/changed routes, RPCs, queues and agents resolve without a restart.
- `@pikku/cli`: `pikku dev` now calls `reloadGeneratedMeta` after each watch-triggered codegen pass and re-imports the changed files once fresh meta is in state, so a NEW route in a changed wiring file registers (its `wireHTTP` no longer no-ops on missing meta).
- `@pikku/schema-cfworker`: `compileSchema` recompiles when a schema's value changes (not only on first sight), so hot-reloaded schemas take effect.
