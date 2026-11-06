---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
---

Crash recovery now warns on the run's trace when it reruns a step, with the run id, step name, attempt and `invocationId`, and when a step fails with `WorkflowStepLeaseExpiredError` for running out of attempts that way, including at `retries: 0`. An ordinary retry after a thrown error logs neither. A store that overrides `claimStepForExecution` calls `logStepRerun` and `logStepAttemptsExhausted` itself.
