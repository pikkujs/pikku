---
'@pikku/cli': patch
'@pikku/inspector': patch
---

`pikku db` schema-codegen warnings are now coded diagnostics routed through the CLI logger instead of raw `console.warn`, so they participate in the existing `--fail-on-warn` gate.

Each warning now carries a PKU code and `warn` severity: `PKU481` (JSON/JSONB column with no concrete `tsType`, degrading to `unknown`), `PKU480` (column named like a date/bool but whose DB type contradicts it), and `PKU482` (a `format` annotation ignored on a non-string column). Running `pikku db migrate --fail-on-warn` (e.g. in CI) now turns these into a hard failure, forcing the `db/annotations.ts` entry — closing the loophole where an untyped jsonb column silently degrades type-safety. Default behaviour is unchanged: the warnings still print, and only fail the build when `--fail-on-warn` is set.
