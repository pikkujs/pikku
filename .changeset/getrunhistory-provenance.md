---
'@pikku/kysely': patch
'@pikku/redis': patch
---

Fix `getRunHistory` dropping step provenance (`fromStepName`). The value was persisted on the step row and used by the graph planner, but `getRunHistory` built its rows from the per-attempt history and never carried `fromStepName` through — so run history (and any timeline reconstructed from it) reported no predecessors. Redis and Kysely `getRunHistory` now return `fromStepName`. Also adds the missing `from_step_name` column (+ backfill) to the Kysely workflow mirror's `workflow_step` schema and persists it on mirror inserts, so a mirror-side history has identical provenance.
