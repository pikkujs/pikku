---
'@pikku/kysely': patch
---

Fix `KyselyWorkflowRunService.getRunSteps`: build the `runningAt` /
`succeededAt` / `failedAt` correlated subqueries through the query builder
instead of raw `sql` fragments, so the active schema (`withSchema(...)`)
qualifies `workflow_step_history`. The raw fragments hardcoded an unqualified
table name and failed with `relation "workflow_step_history" does not exist`
against a connection whose `search_path` did not include the schema.
