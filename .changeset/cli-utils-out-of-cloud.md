---
'@pikku/cli': patch
---

The CLI's generic render helpers (`packages/cli/src/utils/output.ts`), the comment blanker the validate checks scan through (`utils/blank-comments.ts`) and `CloudPreconditionError` (`utils/precondition-error.ts`) move out of `src/cloud/lib` into `src/utils`, and every importer — including the cloud commands still in the CLI — points at the new location. No behaviour change.
