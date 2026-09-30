---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
---

The workflow run lease takes the app's `leaseService` (`holdLease(leaseService, 'workflow-run:<id>', …)`) in place of `pg_advisory_lock` / `GET_LOCK`, for DSL and graph runs alike. A message for a run already being orchestrated elsewhere wakes the run again a second later instead of failing, so a long pass never spends the retry budget the queue keeps for real failures. An inline run whose lease was lost after its body finished keeps the outcome it wrote. `PgWorkflowQueueOptions` and `RunLockHoldTimeoutError` are removed. `WorkflowService.withRunLock` is renamed `withRunLease`, since what it holds runs out unless renewed; a custom workflow service overriding it renames the method.

Pass the lease service to the workflow service — `new PgKyselyWorkflowService(db, { leaseService })` — register the same instance as the app's `leaseService`, and migrate `pikku_lease`.

A step lease is renewed by the same loop as the run lease. A graph node whose worker died is dispatched again once its lease lapses, instead of leaving the run waiting on it. A replayed step on Kysely now sees its lease, as `getStepState` does. The in-memory store refuses a superseded worker's outcome, as the database stores do. The MySQL workflow service can now record a workflow version; it used `ON CONFLICT`, which MySQL does not have.

`pikku db generate` now writes the `pikku_lease` table for any project that runs workflows, not only one that reaches `leaseService`, since every persistent workflow service holds its runs and steps there.
