---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Workflows survive a restart

`pikku dev` and `pikku serve` now recover runs after a crash or deploy. Sleeps are re-armed from when they were scheduled, in-flight steps retry as a counted attempt with the same `invocationId`, and a sweep skips any run another live instance holds the lease on. Other hosts call `workflowService.recoverWorkflows()` from a scheduled task, and `workflow.recovery: false` turns it off. See `docs/MIGRATION.md`.
