---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/skills': patch
---

Add an opt-in strict oxlint preset and `mapConcurrent`. `pikku enable oxlint --strict` merges the preset (built-in oxlint rules: `typescript/no-floating-promises`, `await-thenable`, `only-throw-error`, `eqeqeq`, `import/no-cycle` and others at `error`; `no-await-in-loop`, `no-console`, `no-explicit-any` and others at `warn`) and sets `lint.strict` in `pikku.config.json`; while it is true `pikku validate` reports `oxlint-strict` when the config lacks it. It adds overrides that turn `no-await-in-loop` off in `**/*.workflow.ts` and `typescript/no-floating-promises` off in `*.assert.ts`, `*.verify.ts`, `*.test.*` and `*.spec.*`. `@pikku/core/utils` exports `mapConcurrent(items, fn, { concurrency, signal? })` (in input order, fails fast, abortable); do not use it inside a `pikkuWorkflowFunc` body. Nothing changes unless `lint.strict` is set. See `docs/MIGRATION.md`.
