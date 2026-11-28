---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/cli': patch
'@pikku/workflow-graph': patch
---

Workflow runs and steps can be stored as `cancelling`, and steps as `cancelled`. Stores gain `setStepCancelling`, a compare-and-set from `running` fenced by attempt, and treat a `cancelling` step as a `running` one for outcomes, lease renewal, child links and claim lease checks. Nothing in a run writes the new statuses yet.

A custom workflow store or run mirror has a changed contract: see `docs/MIGRATION.md`.
