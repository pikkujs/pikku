---
'@pikku/inspector': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Warn when a Pikku function body performs a runtime dynamic `import(...)`.

The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.
