---
"@pikku/core": patch
"@pikku/kysely-postgres": patch
"@pikku/queue-pg-boss": patch
---

Fix child workflow completion in queued execution mode. When a sub-workflow completes, the parent step is now marked as succeeded and the parent orchestrator resumes automatically via `onChildWorkflowCompleted`. Adds `parentStepId` to `WorkflowRunWire` to track the parent step without querying. Retains advisory locks in PgKyselyWorkflowService for concurrency safety. Fixes pgboss `registerQueues` to accept an optional logger parameter.
