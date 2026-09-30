---
'@pikku/core': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
'@pikku/mongodb': patch
---

The workflow run lease takes the app's `leaseService` (`withLease('workflow-run:<id>')`) in place of `pg_advisory_lock` / `GET_LOCK`, for DSL and graph runs alike. A message for a run already being orchestrated elsewhere wakes the run again a second later instead of failing, so a long pass never spends the retry budget the queue keeps for real failures. An inline run whose lease was lost after its body finished keeps the outcome it wrote. `PgWorkflowQueueOptions` and `RunLockHoldTimeoutError` are removed.

Register `leaseService: new PgKyselyLeaseService(db)` (or `MySQLKyselyLeaseService`) and migrate `pikku_lease` to keep runs serialised. A queued app without one runs unserialised and is warned once at the first run.
